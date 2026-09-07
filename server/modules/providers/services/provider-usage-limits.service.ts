import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

import { providerAccountsService } from '@/modules/providers/services/provider-accounts.service.js';
import type { ProviderAccountProvider } from '@/shared/types.js';
import { readObjectRecord, readOptionalString } from '@/shared/utils.js';

type UsageWindow = {
  id: 'current' | 'weekly';
  label: string;
  usedPercent: number;
  remainingPercent: number;
  resetsAt: string | null;
  windowMinutes: number | null;
};

type ProviderUsageLimits = {
  provider: ProviderAccountProvider;
  available: boolean;
  fetchedAt: string;
  windows: UsageWindow[];
  /** True when the reading is a cached one served after a failed refresh. */
  stale?: boolean;
};

/**
 * How long a successful reading is reused before asking the provider again.
 *
 * The upstream quota endpoints rate limit hard: measured against the live
 * endpoint, a burst of calls earns an HTTP 429 that outlasts its own
 * `retry-after: 0` header by minutes. Five minutes of cache keeps this server
 * far away from that ceiling no matter how many tabs are open, and is still a
 * fraction of the shortest quota window (5 hours), so the number on screen
 * stays accurate to well under a percentage point.
 */
const CACHE_TTL_MS = 5 * 60_000;

/**
 * How long a failed refresh keeps serving the last good reading.
 *
 * A quota bar that disappears is worse than one that is a few minutes old: the
 * user reads "no limit info" as "something is broken". Past this age the entry
 * is dropped and the bar hides for real, rather than showing a stale number
 * forever.
 */
const STALE_TTL_MS = 15 * 60_000;

type CacheEntry = {
  value: ProviderUsageLimits;
  fetchedAtMs: number;
};

const cache = new Map<string, CacheEntry>();

/** In-flight reads, so concurrent callers share one provider round-trip. */
const inFlight = new Map<string, Promise<ProviderUsageLimits>>();

/** Cache is per account: each user may run under their own provider login. */
const cacheKey = (provider: ProviderAccountProvider, userId: string | number | null): string =>
  `${provider}:${userId ?? 'host'}`;

const clampPercent = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(100, Math.max(0, Math.round(parsed))) : 0;
};

const toIsoFromUnixSeconds = (value: unknown): string | null => {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000).toISOString() : null;
};

async function readClaudeLimits(env: Record<string, string>): Promise<UsageWindow[]> {
  const configDir = env.CLAUDE_CONFIG_DIR?.trim() || path.join(os.homedir(), '.claude');
  const credentials = readObjectRecord(JSON.parse(await readFile(path.join(configDir, '.credentials.json'), 'utf8')));
  const oauth = readObjectRecord(credentials?.claudeAiOauth);
  const accessToken = readOptionalString(oauth?.accessToken);
  if (!accessToken) return [];

  const response = await fetch('https://api.anthropic.com/api/oauth/usage', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(7_000),
  });
  // Thrown, not swallowed: a refusal here is transient (429 is routine on this
  // endpoint) and the caller answers it by serving the cached reading. Coming
  // back as an empty list would read as "this account has no quota info".
  if (!response.ok) {
    throw new Error(`Claude usage endpoint returned HTTP ${response.status}`);
  }

  const payload = readObjectRecord(await response.json());
  const current = readObjectRecord(payload?.five_hour);
  const weekly = readObjectRecord(payload?.seven_day);
  return [
    { id: 'current', label: 'Janela atual', source: current, windowMinutes: 300 },
    { id: 'weekly', label: 'Semana', source: weekly, windowMinutes: 10_080 },
  ].flatMap(({ id, label, source, windowMinutes }) => {
    if (!source) return [];
    const usedPercent = clampPercent(source.utilization);
    return [{
      id: id as UsageWindow['id'],
      label,
      usedPercent,
      remainingPercent: 100 - usedPercent,
      resetsAt: readOptionalString(source.resets_at) ?? null,
      windowMinutes,
    }];
  });
}

async function readCodexLimits(env: Record<string, string>): Promise<UsageWindow[]> {
  return new Promise((resolve) => {
    const child = spawn(process.env.CODEX_CLI_PATH?.trim() || 'codex', ['app-server', '--stdio'], {
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    let output = '';
    let settled = false;
    const finish = (windows: UsageWindow[]) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill();
      resolve(windows);
    };
    const timer = setTimeout(() => finish([]), 8_000);

    child.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString('utf8');
      const lines = output.split('\n');
      output = lines.pop() ?? '';
      for (const line of lines) {
        try {
          const message = readObjectRecord(JSON.parse(line));
          if (message?.id !== 2) continue;
          const result = readObjectRecord(message.result);
          const limits = readObjectRecord(result?.rateLimits);
          if (!limits) return finish([]);
          const windows: UsageWindow[] = [];
          for (const [id, label, raw] of [
            ['current', 'Janela atual', limits.primary],
            ['weekly', 'Semana', limits.secondary],
          ] as const) {
            const source = readObjectRecord(raw);
            if (!source) continue;
            const usedPercent = clampPercent(source.usedPercent);
            windows.push({
              id,
              label,
              usedPercent,
              remainingPercent: 100 - usedPercent,
              resetsAt: toIsoFromUnixSeconds(source.resetsAt),
              windowMinutes: Number(source.windowDurationMins) || null,
            });
          }
          finish(windows);
        } catch {
          // Ignore app-server notifications and incomplete/non-JSON lines.
        }
      }
    });
    child.on('error', () => finish([]));
    child.on('exit', () => finish([]));
    child.stdin.write(`${JSON.stringify({ id: 1, method: 'initialize', params: { clientInfo: { name: 'cloudcli', title: 'CloudCLI', version: '1.0.0' } } })}\n`);
    child.stdin.write(`${JSON.stringify({ method: 'initialized', params: {} })}\n`);
    child.stdin.write(`${JSON.stringify({ id: 2, method: 'account/rateLimits/read', params: {} })}\n`);
  });
}

/** Reads the provider's live quota. Replaceable so tests can drive failures. */
type ReadWindows = (
  provider: ProviderAccountProvider,
  userId: string | number | null,
) => Promise<UsageWindow[]>;

const readWindowsFromProvider: ReadWindows = async (provider, userId) => {
  const { env } = await providerAccountsService.getRuntimeContext(provider, userId, { requireAccount: false });
  return provider === 'claude'
    ? readClaudeLimits(env)
    : readCodexLimits(env);
};

async function readFreshLimits(
  provider: ProviderAccountProvider,
  userId: string | number | null,
  key: string,
  readWindows: ReadWindows,
): Promise<ProviderUsageLimits> {
  const windows = await readWindows(provider, userId);

  // An empty window list is not an error — it is an account with nothing to
  // report — but it must not evict a good reading either, so it is cached
  // only when there is something to show.
  const value: ProviderUsageLimits = {
    provider,
    available: windows.length > 0,
    fetchedAt: new Date().toISOString(),
    windows,
  };
  if (value.available) {
    cache.set(key, { value, fetchedAtMs: Date.now() });
  }
  return value;
}

/** Used by the Providers HTTP route to report the active account's rolling usage quota. */
export const providerUsageLimitsService = {
  /** Test seam: drops every cached reading. */
  resetCache(): void {
    cache.clear();
    inFlight.clear();
  },

  /** Test seam: ages one entry past its TTL without waiting for the clock. */
  expireCacheForTests(provider: ProviderAccountProvider, userId: string | number | null): void {
    const entry = cache.get(cacheKey(provider, userId));
    if (entry) {
      entry.fetchedAtMs -= CACHE_TTL_MS + 1;
    }
  },

  async getUsageLimits(
    provider: ProviderAccountProvider,
    userId: string | number | null,
    readWindows: ReadWindows = readWindowsFromProvider,
  ): Promise<ProviderUsageLimits> {
    const key = cacheKey(provider, userId);
    const cached = cache.get(key);
    const age = cached ? Date.now() - cached.fetchedAtMs : Infinity;

    if (cached && age < CACHE_TTL_MS) {
      return cached.value;
    }

    // Collapse concurrent refreshes: several tabs polling at once should cost
    // one upstream call, not one per tab.
    const pending = inFlight.get(key);
    if (pending) {
      return pending;
    }

    const request = readFreshLimits(provider, userId, key, readWindows)
      .catch((): ProviderUsageLimits => {
        // The upstream quota endpoints rate limit aggressively. Keep showing
        // the last good reading rather than blanking the bar on one refusal.
        if (cached && age < STALE_TTL_MS) {
          return { ...cached.value, stale: true };
        }
        cache.delete(key);
        return { provider, available: false, fetchedAt: new Date().toISOString(), windows: [] };
      })
      .finally(() => {
        inFlight.delete(key);
      });

    inFlight.set(key, request);
    return request;
  },
};
