import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  isProviderUsageLimitError,
  ProviderAccountsService,
} from '@/modules/providers/services/provider-accounts.service.js';
import type {
  ProviderAccountProvider,
  ProviderAuthStatus,
} from '@/shared/types.js';

test('usage-limit detection recognizes provider quota errors without matching normal failures', () => {
  assert.equal(isProviderUsageLimitError(new Error('Claude AI usage limit reached|1785009900')), true);
  assert.equal(isProviderUsageLimitError({ message: '429 too many requests' }), true);
  assert.equal(isProviderUsageLimitError(new Error('insufficient_quota')), true);
  assert.equal(isProviderUsageLimitError(new Error('Authentication token expired')), false);
});

test('provider accounts keep isolated homes and rotate to the next authenticated account', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'cloudcli-provider-accounts-'));
  const accountsRoot = path.join(tempRoot, 'accounts');
  const claudeHome = path.join(tempRoot, 'claude-home');
  const codexHome = path.join(tempRoot, 'codex-home');
  await Promise.all([mkdir(claudeHome), mkdir(codexHome)]);

  const authStatusResolver = async (
    provider: ProviderAccountProvider,
    env: Record<string, string>,
  ): Promise<ProviderAuthStatus> => {
    const profileHome = env.CLAUDE_CONFIG_DIR || env.CODEX_HOME || '';
    return {
      installed: true,
      provider,
      authenticated: Boolean(profileHome),
      email: profileHome ? `${path.basename(profileHome)}@example.test` : null,
      method: profileHome ? 'credentials_file' : null,
      error: profileHome ? undefined : 'Not authenticated',
    };
  };

  const service = new ProviderAccountsService({
    accountsRoot,
    providerHomes: { claude: claudeHome, codex: codexHome },
    authStatusResolver,
    globalAccountAccessResolver: () => false,
  });

  try {
    const first = await service.createAccount('claude', 42, 'Trabalho');
    const second = await service.createAccount('claude', 42, 'Pessoal');
    const runtime = await service.getRuntimeContext('claude', 42);

    assert.equal(runtime.profileId, second.account.id);
    assert.equal(path.basename(runtime.env.CLAUDE_CONFIG_DIR), second.account.id);
    assert.match(first.loginCommand, /CLAUDE_CONFIG_DIR=/);
    assert.equal(await service.isAllowedLoginCommand(42, first.loginCommand), true);
    assert.equal(
      await service.isAllowedLoginCommand(42, `${first.loginCommand}; bash`),
      false,
    );
    assert.equal(await service.isAllowedLoginCommand(99, first.loginCommand), false);

    const switched = await service.switchAfterUsageLimit(
      'claude',
      42,
      second.account.id,
      new Error('usage limit reached'),
    );

    assert.deepEqual(switched, {
      fromProfileId: second.account.id,
      toProfileId: first.account.id,
      accountName: 'Trabalho',
    });

    const snapshot = await service.listAccounts('claude', 42);
    assert.equal(snapshot.autoSwitch, true);
    assert.equal(snapshot.activeProfileId, first.account.id);
    assert.equal(snapshot.accounts.find((account) => account.id === second.account.id)?.coolingUntil !== null, true);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test('automatic rotation can be disabled per provider', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'cloudcli-provider-accounts-disabled-'));
  const service = new ProviderAccountsService({
    accountsRoot: path.join(tempRoot, 'accounts'),
    providerHomes: {
      claude: path.join(tempRoot, 'claude-home'),
      codex: path.join(tempRoot, 'codex-home'),
    },
    authStatusResolver: async (provider) => ({
      installed: true,
      provider,
      authenticated: true,
      email: 'account@example.test',
      method: 'credentials_file',
    }),
    globalAccountAccessResolver: () => false,
  });

  try {
    const account = await service.createAccount('codex', 'user-1', 'Conta extra');
    await service.updateSettings('codex', 'user-1', false);
    const switched = await service.switchAfterUsageLimit(
      'codex',
      'user-1',
      account.account.id,
      new Error('429 rate limit'),
    );
    assert.equal(switched, null);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test('users without permission cannot see, activate, log into, or execute the global account', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'cloudcli-provider-accounts-denied-'));
  const service = new ProviderAccountsService({
    accountsRoot: path.join(tempRoot, 'accounts'),
    providerHomes: {
      claude: path.join(tempRoot, 'claude-home'),
      codex: path.join(tempRoot, 'codex-home'),
    },
    authStatusResolver: async (provider, env) => ({
      installed: true,
      provider,
      authenticated: Object.keys(env).length === 0,
      email: Object.keys(env).length === 0 ? 'global@example.test' : null,
      method: Object.keys(env).length === 0 ? 'credentials_file' : null,
    }),
    globalAccountAccessResolver: () => false,
  });

  try {
    const snapshot = await service.listAccounts('claude', 7);
    assert.equal(snapshot.allowGlobalAccount, false);
    assert.equal(snapshot.activeProfileId, null);
    assert.equal(snapshot.accounts.some((account) => account.isDefault), false);

    await assert.rejects(
      service.getRuntimeContext('claude', 7),
      (error: unknown) => (
        error instanceof Error
        && 'code' in error
        && error.code === 'PERSONAL_PROVIDER_ACCOUNT_REQUIRED'
      ),
    );
    await assert.rejects(
      service.activateAccount('claude', 7, 'default'),
      (error: unknown) => (
        error instanceof Error
        && 'code' in error
        && error.code === 'GLOBAL_PROVIDER_ACCOUNT_FORBIDDEN'
      ),
    );
    await assert.rejects(
      service.getLoginCommand('claude', 7, 'default'),
      (error: unknown) => (
        error instanceof Error
        && 'code' in error
        && error.code === 'GLOBAL_PROVIDER_ACCOUNT_FORBIDDEN'
      ),
    );
    assert.equal(
      await service.isAllowedLoginCommand(
        7,
        'claude --dangerously-skip-permissions /login',
      ),
      false,
    );
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test('users with permission retain the global provider account', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'cloudcli-provider-accounts-allowed-'));
  const service = new ProviderAccountsService({
    accountsRoot: path.join(tempRoot, 'accounts'),
    providerHomes: {
      claude: path.join(tempRoot, 'claude-home'),
      codex: path.join(tempRoot, 'codex-home'),
    },
    authStatusResolver: async (provider) => ({
      installed: true,
      provider,
      authenticated: true,
      email: 'global@example.test',
      method: 'credentials_file',
    }),
    globalAccountAccessResolver: () => true,
  });

  try {
    const snapshot = await service.listAccounts('codex', 8);
    assert.equal(snapshot.allowGlobalAccount, true);
    assert.equal(snapshot.activeProfileId, 'default');
    assert.equal(snapshot.accounts[0]?.isDefault, true);
    assert.deepEqual(await service.getRuntimeContext('codex', 8), {
      env: {},
      profileId: 'default',
    });
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});
