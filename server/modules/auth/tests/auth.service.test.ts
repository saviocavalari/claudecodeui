import assert from 'node:assert/strict';
import test from 'node:test';

import { AppError } from '@/shared/utils.js';

import { createAuthService } from '../auth.service.js';

type AuthDependencies = Parameters<typeof createAuthService>[0];

function createDependencies(overrides: Partial<AuthDependencies> = {}): AuthDependencies {
  return {
    users: {
      hasUsers: () => false,
      createUser: (username, passwordHash) => ({ id: 1, username, password_hash: passwordHash }),
      getUserByUsername: () => undefined,
      getUserWithPasswordById: () => undefined,
      updatePassword: () => undefined,
      updateLastLogin: () => undefined,
    },
    transaction: {
      begin: () => undefined,
      commit: () => undefined,
      rollback: () => undefined,
    },
    hashPassword: async () => 'hashed-password',
    comparePassword: async () => false,
    generateToken: () => 'signed-token',
    ...overrides,
  };
}

test('register hashes credentials and commits through injected dependencies', async () => {
  const operations: string[] = [];
  const service = createAuthService(createDependencies({
    transaction: {
      begin: () => operations.push('begin'),
      commit: () => operations.push('commit'),
      rollback: () => operations.push('rollback'),
    },
    hashPassword: async (password) => {
      operations.push(`hash:${password}`);
      return 'hash';
    },
    users: {
      hasUsers: () => false,
      createUser: (username, passwordHash) => {
        operations.push(`create:${username}:${passwordHash}`);
        return { id: 1, username, password_hash: passwordHash };
      },
      getUserByUsername: () => undefined,
      getUserWithPasswordById: () => undefined,
      updatePassword: () => undefined,
      updateLastLogin: (userId) => operations.push(`login:${userId}`),
    },
  }));

  const result = await service.register('alice', 'secret12');

  assert.equal(result.token, 'signed-token');
  assert.deepEqual(operations, ['begin', 'hash:secret12', 'create:alice:hash', 'commit', 'login:1']);
});

test('login rejects an invalid password without issuing a token', async () => {
  let tokenIssued = false;
  const service = createAuthService(createDependencies({
    users: {
      hasUsers: () => true,
      createUser: () => { throw new Error('unused'); },
      getUserByUsername: () => ({ id: 1, username: 'alice', password_hash: 'hash' }),
      getUserWithPasswordById: () => undefined,
      updatePassword: () => undefined,
      updateLastLogin: () => undefined,
    },
    comparePassword: async () => false,
    generateToken: () => {
      tokenIssued = true;
      return 'token';
    },
  }));

  await assert.rejects(
    service.login('alice', 'wrong-password'),
    (error: unknown) => error instanceof AppError && error.code === 'AUTH_INVALID_CREDENTIALS',
  );
  assert.equal(tokenIssued, false);
});

test('refreshSession issues a replacement token for the authenticated user', () => {
  let tokenUser: { id: number | bigint; username: string } | undefined;
  const service = createAuthService(createDependencies({
    generateToken: (user) => {
      tokenUser = user;
      return 'replacement-token';
    },
  }));

  const result = service.refreshSession({ id: 7, username: 'alice' });

  assert.deepEqual(result, { token: 'replacement-token' });
  assert.deepEqual(tokenUser, { id: 7, username: 'alice' });
});

test('changePassword rewrites the hash of the account taken from the token', async () => {
  const writes: Array<{ userId: number; passwordHash: string }> = [];
  let lookedUpId: number | undefined;
  const service = createAuthService(createDependencies({
    users: {
      hasUsers: () => true,
      createUser: () => { throw new Error('unused'); },
      getUserByUsername: () => { throw new Error('must not resolve the account by username'); },
      getUserWithPasswordById: (userId) => {
        lookedUpId = userId;
        return { id: userId, username: 'alice', password_hash: 'old-hash' };
      },
      updatePassword: (userId, passwordHash) => writes.push({ userId, passwordHash }),
      updateLastLogin: () => undefined,
    },
    comparePassword: async () => true,
    hashPassword: async () => 'new-hash',
  }));

  const result = await service.changePassword({ id: 7, username: 'alice' }, 'old-secret', 'new-secret');

  assert.deepEqual(result, { success: true });
  assert.equal(lookedUpId, 7);
  assert.deepEqual(writes, [{ userId: 7, passwordHash: 'new-hash' }]);
});

test('changePassword rejects a wrong current password without touching the hash', async () => {
  let wrote = false;
  const service = createAuthService(createDependencies({
    users: {
      hasUsers: () => true,
      createUser: () => { throw new Error('unused'); },
      getUserByUsername: () => undefined,
      getUserWithPasswordById: (userId) => ({ id: userId, username: 'alice', password_hash: 'old-hash' }),
      updatePassword: () => { wrote = true; },
      updateLastLogin: () => undefined,
    },
    comparePassword: async () => false,
  }));

  await assert.rejects(
    service.changePassword({ id: 7, username: 'alice' }, 'wrong-secret', 'new-secret'),
    (error: unknown) => error instanceof AppError && error.code === 'AUTH_INVALID_CREDENTIALS',
  );
  assert.equal(wrote, false);
});

test('changePassword rejects an unauthenticated caller', async () => {
  const service = createAuthService(createDependencies());

  await assert.rejects(
    service.changePassword(undefined, 'old-secret', 'new-secret'),
    (error: unknown) => error instanceof AppError && error.code === 'AUTH_USER_REQUIRED',
  );
});

test('changePassword rejects a new password shorter than six characters', async () => {
  const service = createAuthService(createDependencies());

  await assert.rejects(
    service.changePassword({ id: 7, username: 'alice' }, 'old-secret', 'short'),
    (error: unknown) => error instanceof AppError && error.code === 'AUTH_CREDENTIALS_TOO_SHORT',
  );
});
