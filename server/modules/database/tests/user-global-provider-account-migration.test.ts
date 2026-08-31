import assert from 'node:assert/strict';
import test from 'node:test';

import Database from 'better-sqlite3';

import { runMigrations } from '@/modules/database/migrations.js';

test('global provider account migration preserves owners and denies existing members', () => {
  const db = new Database(':memory:');
  try {
    db.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_login DATETIME,
        is_active BOOLEAN DEFAULT 1,
        git_name TEXT,
        git_email TEXT,
        has_completed_onboarding BOOLEAN DEFAULT 0,
        role TEXT NOT NULL DEFAULT 'member'
      );
      INSERT INTO users (username, password_hash, role)
      VALUES
        ('owner', 'hash', 'member'),
        ('member', 'hash', 'member');
    `);

    runMigrations(db);

    const users = db.prepare(`
      SELECT username, can_use_global_provider_account
      FROM users
      ORDER BY id
    `).all() as {
      username: string;
      can_use_global_provider_account: number;
    }[];

    assert.deepEqual(users, [
      { username: 'owner', can_use_global_provider_account: 1 },
      { username: 'member', can_use_global_provider_account: 0 },
    ]);
  } finally {
    db.close();
  }
});
