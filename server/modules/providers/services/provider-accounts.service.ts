import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, stat, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { userDb } from '@/modules/database/index.js';
import type {
  ProviderAccount,
  ProviderAccountProvider,
  ProviderAccountsSnapshot,
  ProviderAuthStatus,
} from '@/shared/types.js';
import { AppError } from '@/shared/utils.js';

type StoredProfile = {
  id: string;
  name: string;
  createdAt: string;
  coolingUntil?: string | null;
};

type StoredState = {
  version: 1;
  activeProfileId: string;
  autoSwitch: boolean;
  defaultCoolingUntil?: string | null;
  profiles: StoredProfile[];
};

type RuntimeContext = {
  env: Record<string, string>;
  profileId: string;
};

type RuntimeContextOptions = {
  requireAccount?: boolean;
};

const DEFAULT_PROFILE_ID = 'default';
const ACCOUNT_PROVIDERS = new Set<ProviderAccountProvider>(['claude', 'codex']);
const PROFILE_ID_PATTERN = /^[a-f0-9-]{36}$/;
const DEFAULT_COOLDOWN_MS = 60 * 60 * 1000;

const SHARED_CONFIG_ENTRIES: Record<ProviderAccountProvider, string[]> = {
  claude: [
    'settings.json',
    'projects',
    'commands',
    'skills',
    'plugins',
    'agents',
    'CLAUDE.md',
  ],
  codex: [
    'config.toml',
    'sessions',
    'archived_sessions',
    'history.jsonl',
    'skills',
    'plugins',
    'rules',
    'AGENTS.md',
  ],
};

const createInitialState = (): StoredState => ({
  version: 1,
  activeProfileId: DEFAULT_PROFILE_ID,
  autoSwitch: true,
  defaultCoolingUntil: null,
  profiles: [],
});

const normalizeName = (value: unknown, fallback: string): string => {
  if (typeof value !== 'string') {
    return fallback;
  }

  const normalized = value.trim().replace(/\s+/g, ' ');
  return normalized ? normalized.slice(0, 80) : fallback;
};

const shellQuote = (value: string): string => `'${value.replace(/'/g, `'\\''`)}'`;

const readErrorText = (error: unknown): string => {
  if (error instanceof Error) {
    return `${error.name} ${error.message}`.trim();
  }
  if (typeof error === 'string') {
    return error;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
};

export const isProviderUsageLimitError = (error: unknown): boolean => {
  const text = readErrorText(error).toLowerCase();
  return (
    /\b429\b/.test(text)
    || text.includes('usage limit')
    || text.includes('rate limit')
    || text.includes('rate_limit')
    || text.includes('quota exceeded')
    || text.includes('quota_exceeded')
    || text.includes('insufficient_quota')
    || text.includes('too many requests')
    || text.includes('limit reached')
  );
};

const inferCooldownUntil = (error: unknown): string => {
  const text = readErrorText(error);
  const timestampMatch = text.match(/(?:usage limit reached\|?|reset(?:s| at)?[:\s]+)(\d{10,13})/i);
  if (timestampMatch) {
    const raw = Number(timestampMatch[1]);
    const timestamp = raw < 10_000_000_000 ? raw * 1000 : raw;
    if (Number.isFinite(timestamp) && timestamp > Date.now()) {
      return new Date(timestamp).toISOString();
    }
  }
  return new Date(Date.now() + DEFAULT_COOLDOWN_MS).toISOString();
};

class ProviderAccountsService {
  private readonly accountsRoot: string;
  private readonly providerHomes: Record<ProviderAccountProvider, string>;
  private readonly authStatusResolver: (
    provider: ProviderAccountProvider,
    env: Record<string, string>,
  ) => Promise<ProviderAuthStatus>;
  private readonly globalAccountAccessResolver: (
    userId: string | number | null | undefined,
  ) => boolean | Promise<boolean>;

  constructor(options: {
    accountsRoot?: string;
    providerHomes?: Partial<Record<ProviderAccountProvider, string>>;
    authStatusResolver?: (
      provider: ProviderAccountProvider,
      env: Record<string, string>,
    ) => Promise<ProviderAuthStatus>;
    globalAccountAccessResolver?: (
      userId: string | number | null | undefined,
    ) => boolean | Promise<boolean>;
  } = {}) {
    this.accountsRoot = options.accountsRoot
      ?? path.join(os.homedir(), '.cloudcli', 'provider-accounts');
    this.providerHomes = {
      claude: options.providerHomes?.claude ?? path.join(os.homedir(), '.claude'),
      codex: options.providerHomes?.codex ?? path.join(os.homedir(), '.codex'),
    };
    // The registry is imported lazily: it pulls in every provider runtime, and
    // those runtimes import this service back for their per-account credentials.
    // A top-level import would close that cycle and leave whichever module the
    // process loads first with an uninitialized binding.
    this.authStatusResolver = options.authStatusResolver ?? (
      async (provider, env) => {
        const { providerRegistry } = await import('@/modules/providers/provider.registry.js');
        return providerRegistry.resolveProvider(provider).auth.getStatus({ env });
      }
    );
    this.globalAccountAccessResolver = options.globalAccountAccessResolver ?? ((userId) => {
      if (userId === null || userId === undefined) {
        // Server-owned maintenance tasks have no end-user identity and retain
        // the historical host account behavior.
        return true;
      }
      const numericUserId = Number(userId);
      if (!Number.isInteger(numericUserId)) {
        return false;
      }
      return Boolean(
        userDb.getUserById(numericUserId)?.can_use_global_provider_account,
      );
    });
  }

  isSupported(provider: string): provider is ProviderAccountProvider {
    return ACCOUNT_PROVIDERS.has(provider as ProviderAccountProvider);
  }

  async listAccounts(
    provider: ProviderAccountProvider,
    userId: string | number | null | undefined,
  ): Promise<ProviderAccountsSnapshot> {
    const state = await this.readState(provider, userId);
    const allowGlobalAccount = await this.canUseGlobalAccount(userId);
    if (
      !allowGlobalAccount
      && state.activeProfileId === DEFAULT_PROFILE_ID
      && state.profiles[0]
    ) {
      state.activeProfileId = state.profiles[0].id;
      await this.writeState(provider, userId, state);
    }
    const storedProfiles: StoredProfile[] = [
      ...(allowGlobalAccount ? [{
        id: DEFAULT_PROFILE_ID,
        name: 'Conta principal',
        createdAt: '',
        coolingUntil: state.defaultCoolingUntil ?? null,
      }] : []),
      ...state.profiles,
    ];
    const activeProfileId = state.activeProfileId === DEFAULT_PROFILE_ID && !allowGlobalAccount
      ? null
      : state.activeProfileId;

    const accounts = await Promise.all(storedProfiles.map(async (profile): Promise<ProviderAccount> => {
      const env = this.getProfileEnv(provider, userId, profile.id);
      const status = await this.authStatusResolver(provider, env);
      return {
        id: profile.id,
        name: profile.name,
        isDefault: profile.id === DEFAULT_PROFILE_ID,
        isActive: profile.id === activeProfileId,
        authenticated: status.authenticated,
        email: status.email,
        method: status.method,
        error: status.error ?? null,
        createdAt: profile.createdAt || null,
        coolingUntil: profile.coolingUntil ?? null,
      };
    }));

    return {
      provider,
      activeProfileId,
      autoSwitch: state.autoSwitch,
      allowGlobalAccount,
      accounts,
    };
  }

  async createAccount(
    provider: ProviderAccountProvider,
    userId: string | number | null | undefined,
    name?: unknown,
  ): Promise<{ account: ProviderAccount; loginCommand: string }> {
    const state = await this.readState(provider, userId);
    const profileNumber = state.profiles.length + 2;
    const id = randomUUID();
    const profile: StoredProfile = {
      id,
      name: normalizeName(name, `Conta ${profileNumber}`),
      createdAt: new Date().toISOString(),
      coolingUntil: null,
    };

    await this.prepareProfileDirectory(provider, userId, id);
    state.profiles.push(profile);
    state.activeProfileId = id;
    await this.writeState(provider, userId, state);

    return {
      account: {
        id,
        name: profile.name,
        isDefault: false,
        isActive: true,
        authenticated: false,
        email: null,
        method: null,
        error: null,
        createdAt: profile.createdAt,
        coolingUntil: null,
      },
      loginCommand: this.buildLoginCommand(provider, userId, id),
    };
  }

  async getLoginCommand(
    provider: ProviderAccountProvider,
    userId: string | number | null | undefined,
    profileId: string,
  ): Promise<string> {
    if (profileId === DEFAULT_PROFILE_ID) {
      await this.requireGlobalAccountAccess(userId);
      return provider === 'claude'
        ? 'claude --dangerously-skip-permissions /login'
        : 'codex login --device-auth';
    }

    const state = await this.readState(provider, userId);
    this.requireStoredProfile(state, profileId);
    await this.prepareProfileDirectory(provider, userId, profileId);
    return this.buildLoginCommand(provider, userId, profileId);
  }

  async isAllowedLoginCommand(
    userId: string | number | null | undefined,
    command: string,
  ): Promise<boolean> {
    for (const provider of ['claude', 'codex'] as const) {
      const state = await this.readState(provider, userId);
      for (const profile of state.profiles) {
        if (command === this.buildLoginCommand(provider, userId, profile.id)) {
          return true;
        }
      }

      if (
        command === (provider === 'claude'
          ? 'claude --dangerously-skip-permissions /login'
          : 'codex login --device-auth')
      ) {
        try {
          await this.requireGlobalAccountAccess(userId);
          return true;
        } catch {
          // A global login command is only valid for users who may use it.
        }
      }
    }

    return false;
  }

  async activateAccount(
    provider: ProviderAccountProvider,
    userId: string | number | null | undefined,
    profileId: string,
  ): Promise<ProviderAccountsSnapshot> {
    const state = await this.readState(provider, userId);
    if (profileId === DEFAULT_PROFILE_ID) {
      await this.requireGlobalAccountAccess(userId);
    } else {
      this.requireStoredProfile(state, profileId);
    }
    state.activeProfileId = profileId;
    const profile = state.profiles.find((candidate) => candidate.id === profileId);
    if (profile) {
      profile.coolingUntil = null;
    } else {
      state.defaultCoolingUntil = null;
    }
    await this.writeState(provider, userId, state);
    return this.listAccounts(provider, userId);
  }

  async updateSettings(
    provider: ProviderAccountProvider,
    userId: string | number | null | undefined,
    autoSwitch: boolean,
  ): Promise<ProviderAccountsSnapshot> {
    const state = await this.readState(provider, userId);
    state.autoSwitch = autoSwitch;
    await this.writeState(provider, userId, state);
    return this.listAccounts(provider, userId);
  }

  async deleteAccount(
    provider: ProviderAccountProvider,
    userId: string | number | null | undefined,
    profileId: string,
  ): Promise<ProviderAccountsSnapshot> {
    if (profileId === DEFAULT_PROFILE_ID || !PROFILE_ID_PATTERN.test(profileId)) {
      throw new AppError('The primary provider account cannot be deleted.', {
        code: 'PROVIDER_ACCOUNT_DELETE_FORBIDDEN',
        statusCode: 400,
      });
    }

    const state = await this.readState(provider, userId);
    this.requireStoredProfile(state, profileId);
    state.profiles = state.profiles.filter((profile) => profile.id !== profileId);
    if (state.activeProfileId === profileId) {
      state.activeProfileId = await this.canUseGlobalAccount(userId)
        ? DEFAULT_PROFILE_ID
        : state.profiles[0]?.id ?? DEFAULT_PROFILE_ID;
    }
    await this.writeState(provider, userId, state);

    const profilePath = this.getProfilePath(provider, userId, profileId);
    await rm(profilePath, { recursive: true, force: true });
    return this.listAccounts(provider, userId);
  }

  async getRuntimeContext(
    provider: ProviderAccountProvider,
    userId: string | number | null | undefined,
    options: RuntimeContextOptions = {},
  ): Promise<RuntimeContext> {
    const state = await this.readState(provider, userId);
    const allowGlobalAccount = await this.canUseGlobalAccount(userId);
    if (state.activeProfileId === DEFAULT_PROFILE_ID && !allowGlobalAccount) {
      const ownedProfile = state.profiles[0];
      if (ownedProfile) {
        state.activeProfileId = ownedProfile.id;
        await this.writeState(provider, userId, state);
        return {
          env: this.getProfileEnv(provider, userId, ownedProfile.id),
          profileId: ownedProfile.id,
        };
      }

      if (options.requireAccount === false) {
        return {
          env: this.getUnconfiguredProfileEnv(provider, userId),
          profileId: 'none',
        };
      }

      throw new AppError(
        `Conecte sua própria conta ${provider === 'claude' ? 'Claude' : 'Codex'} para continuar. O acesso à conta global não está liberado para este usuário.`,
        {
          code: 'PERSONAL_PROVIDER_ACCOUNT_REQUIRED',
          statusCode: 403,
        },
      );
    }
    return {
      env: this.getProfileEnv(provider, userId, state.activeProfileId),
      profileId: state.activeProfileId,
    };
  }

  async switchAfterUsageLimit(
    provider: ProviderAccountProvider,
    userId: string | number | null | undefined,
    exhaustedProfileId: string,
    error: unknown,
  ): Promise<{ fromProfileId: string; toProfileId: string; accountName: string } | null> {
    if (!isProviderUsageLimitError(error)) {
      return null;
    }

    const state = await this.readState(provider, userId);
    if (!state.autoSwitch || state.activeProfileId !== exhaustedProfileId) {
      return null;
    }

    const exhausted = state.profiles.find((profile) => profile.id === exhaustedProfileId);
    if (exhausted) {
      exhausted.coolingUntil = inferCooldownUntil(error);
    } else if (exhaustedProfileId === DEFAULT_PROFILE_ID) {
      state.defaultCoolingUntil = inferCooldownUntil(error);
    }

    const allowGlobalAccount = await this.canUseGlobalAccount(userId);
    const candidates: StoredProfile[] = [
      ...(allowGlobalAccount ? [{
        id: DEFAULT_PROFILE_ID,
        name: 'Conta principal',
        createdAt: '',
        coolingUntil: state.defaultCoolingUntil ?? null,
      }] : []),
      ...state.profiles,
    ];
    const activeIndex = candidates.findIndex((profile) => profile.id === exhaustedProfileId);
    const ordered = [
      ...candidates.slice(activeIndex + 1),
      ...candidates.slice(0, Math.max(0, activeIndex)),
    ];

    for (const candidate of ordered) {
      const coolingUntil = candidate.coolingUntil ? Date.parse(candidate.coolingUntil) : 0;
      if (coolingUntil > Date.now()) {
        continue;
      }
      const status = await this.authStatusResolver(
        provider,
        this.getProfileEnv(provider, userId, candidate.id),
      );
      if (!status.authenticated) {
        continue;
      }

      state.activeProfileId = candidate.id;
      await this.writeState(provider, userId, state);
      return {
        fromProfileId: exhaustedProfileId,
        toProfileId: candidate.id,
        accountName: candidate.name,
      };
    }

    await this.writeState(provider, userId, state);
    return null;
  }

  private getUserKey(userId: string | number | null | undefined): string {
    return createHash('sha256')
      .update(String(userId ?? 'local'))
      .digest('hex')
      .slice(0, 24);
  }

  private getProviderRoot(
    provider: ProviderAccountProvider,
    userId: string | number | null | undefined,
  ): string {
    return path.join(this.accountsRoot, this.getUserKey(userId), provider);
  }

  private getStatePath(
    provider: ProviderAccountProvider,
    userId: string | number | null | undefined,
  ): string {
    return path.join(this.getProviderRoot(provider, userId), 'state.json');
  }

  private getProfilePath(
    provider: ProviderAccountProvider,
    userId: string | number | null | undefined,
    profileId: string,
  ): string {
    if (!PROFILE_ID_PATTERN.test(profileId)) {
      throw new AppError('Invalid provider account id.', {
        code: 'INVALID_PROVIDER_ACCOUNT_ID',
        statusCode: 400,
      });
    }
    return path.join(this.getProviderRoot(provider, userId), 'profiles', profileId);
  }

  private getProfileEnv(
    provider: ProviderAccountProvider,
    userId: string | number | null | undefined,
    profileId: string,
  ): Record<string, string> {
    if (profileId === DEFAULT_PROFILE_ID) {
      return {};
    }

    const profilePath = this.getProfilePath(provider, userId, profileId);
    return provider === 'claude'
      ? { CLAUDE_CONFIG_DIR: profilePath }
      : { CODEX_HOME: profilePath };
  }

  private getUnconfiguredProfileEnv(
    provider: ProviderAccountProvider,
    userId: string | number | null | undefined,
  ): Record<string, string> {
    const profilePath = path.join(this.getProviderRoot(provider, userId), 'unconfigured');
    return provider === 'claude'
      ? { CLAUDE_CONFIG_DIR: profilePath }
      : { CODEX_HOME: profilePath };
  }

  private async canUseGlobalAccount(
    userId: string | number | null | undefined,
  ): Promise<boolean> {
    return Boolean(await this.globalAccountAccessResolver(userId));
  }

  private async requireGlobalAccountAccess(
    userId: string | number | null | undefined,
  ): Promise<void> {
    if (await this.canUseGlobalAccount(userId)) {
      return;
    }
    throw new AppError('Este usuário não tem permissão para usar a conta global.', {
      code: 'GLOBAL_PROVIDER_ACCOUNT_FORBIDDEN',
      statusCode: 403,
    });
  }

  private async readState(
    provider: ProviderAccountProvider,
    userId: string | number | null | undefined,
  ): Promise<StoredState> {
    const statePath = this.getStatePath(provider, userId);
    try {
      const parsed = JSON.parse(await readFile(statePath, 'utf8')) as Partial<StoredState>;
      const profiles = Array.isArray(parsed.profiles)
        ? parsed.profiles.filter((profile): profile is StoredProfile => (
          Boolean(profile)
          && typeof profile.id === 'string'
          && PROFILE_ID_PATTERN.test(profile.id)
          && typeof profile.name === 'string'
          && typeof profile.createdAt === 'string'
        ))
        : [];
      const activeProfileId = parsed.activeProfileId === DEFAULT_PROFILE_ID
        || profiles.some((profile) => profile.id === parsed.activeProfileId)
        ? parsed.activeProfileId as string
        : DEFAULT_PROFILE_ID;
      return {
        version: 1,
        activeProfileId,
        autoSwitch: parsed.autoSwitch !== false,
        defaultCoolingUntil: typeof parsed.defaultCoolingUntil === 'string'
          ? parsed.defaultCoolingUntil
          : null,
        profiles,
      };
    } catch {
      return createInitialState();
    }
  }

  private async writeState(
    provider: ProviderAccountProvider,
    userId: string | number | null | undefined,
    state: StoredState,
  ): Promise<void> {
    const providerRoot = this.getProviderRoot(provider, userId);
    const statePath = this.getStatePath(provider, userId);
    const temporaryPath = `${statePath}.${randomUUID()}.tmp`;
    await mkdir(providerRoot, { recursive: true, mode: 0o700 });
    await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
    await rename(temporaryPath, statePath);
  }

  private requireStoredProfile(state: StoredState, profileId: string): StoredProfile {
    const profile = state.profiles.find((candidate) => candidate.id === profileId);
    if (!profile) {
      throw new AppError('Provider account was not found.', {
        code: 'PROVIDER_ACCOUNT_NOT_FOUND',
        statusCode: 404,
      });
    }
    return profile;
  }

  private async prepareProfileDirectory(
    provider: ProviderAccountProvider,
    userId: string | number | null | undefined,
    profileId: string,
  ): Promise<void> {
    const profilePath = this.getProfilePath(provider, userId, profileId);
    await mkdir(profilePath, { recursive: true, mode: 0o700 });

    for (const entry of SHARED_CONFIG_ENTRIES[provider]) {
      const source = path.join(this.providerHomes[provider], entry);
      const destination = path.join(profilePath, entry);
      try {
        await stat(source);
        await symlink(source, destination);
      } catch {
        // Missing sources and already-created links are both safe to ignore.
      }
    }
  }

  private buildLoginCommand(
    provider: ProviderAccountProvider,
    userId: string | number | null | undefined,
    profileId: string,
  ): string {
    const profilePath = this.getProfilePath(provider, userId, profileId);
    return provider === 'claude'
      ? `env CLAUDE_CONFIG_DIR=${shellQuote(profilePath)} claude --dangerously-skip-permissions /login`
      : `env CODEX_HOME=${shellQuote(profilePath)} codex login --device-auth`;
  }
}

export const providerAccountsService = new ProviderAccountsService();
export { ProviderAccountsService };
