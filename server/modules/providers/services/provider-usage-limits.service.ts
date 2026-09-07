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
};

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
  if (!response.ok) return [];

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

/** Used by the Providers HTTP route to report the active account's rolling usage quota. */
export const providerUsageLimitsService = {
  async getUsageLimits(
    provider: ProviderAccountProvider,
    userId: string | number | null,
  ): Promise<ProviderUsageLimits> {
    const { env } = await providerAccountsService.getRuntimeContext(provider, userId, { requireAccount: false });
    try {
      const windows = provider === 'claude'
        ? await readClaudeLimits(env)
        : await readCodexLimits(env);
      return { provider, available: windows.length > 0, fetchedAt: new Date().toISOString(), windows };
    } catch {
      return { provider, available: false, fetchedAt: new Date().toISOString(), windows: [] };
    }
  },
};
