/**
 * User repository.
 *
 * Provides typed CRUD operations for the `users` table.
 * This is a single-user system, but the schema supports multiple
 * users for forward compatibility.
 */

import { getConnection } from '@/modules/database/connection.js';

type UserRow = {
  id: number;
  username: string;
  password_hash: string;
  created_at: string;
  last_login: string | null;
  is_active: number;
  git_name: string | null;
  git_email: string | null;
  has_completed_onboarding: number;
  role: string;
};

type UserPublicRow = Pick<
  UserRow,
  'id' | 'username' | 'created_at' | 'last_login' | 'role'
>;

/** Row shape returned to the admin user-management panel. */
export type UserAdminRow = Pick<
  UserRow,
  'id' | 'username' | 'created_at' | 'last_login' | 'is_active' | 'role'
>;

type UserGitConfig = {
  git_name: string | null;
  git_email: string | null;
};

type CreateUserResult = {
  id: number | bigint;
  username: string;
};

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export const userDb = {
  /** Returns true if at least one user exists in the database. */
  hasUsers(): boolean {
    const db = getConnection();
    const row = db.prepare('SELECT COUNT(*) as count FROM users').get() as {
      count: number;
    };
    return row.count > 0;
  },

  /**
   * Inserts a new user and returns the created ID + username.
   * `role` defaults to 'member'; the very first account should be 'admin'.
   */
  createUser(
    username: string,
    passwordHash: string,
    role: 'admin' | 'member' = 'member'
  ): CreateUserResult {
    const db = getConnection();
    const result = db
      .prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)')
      .run(username, passwordHash, role);
    return { id: result.lastInsertRowid, username };
  },

  /**
   * Looks up an active user by username.
   * Returns the full row (including password hash) for auth verification.
   */
  getUserByUsername(username: string): UserRow | undefined {
    const db = getConnection();
    return db
      .prepare('SELECT * FROM users WHERE username = ? AND is_active = 1')
      .get(username) as UserRow | undefined;
  },

  /** Updates the last_login timestamp. Non-fatal — logs but does not throw. */
  updateLastLogin(userId: number): void {
    try {
      const db = getConnection();
      db.prepare(
        'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?'
      ).run(userId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Failed to update last login', { error: message });
    }
  },

  /**
   * Returns public user fields by ID (no password hash), including the role
   * so downstream authorization can gate project access. Only active users are
   * returned, so a deactivated account is rejected at the auth layer.
   */
  getUserById(userId: number): UserPublicRow | undefined {
    const db = getConnection();
    return db
      .prepare(
        'SELECT id, username, created_at, last_login, role FROM users WHERE id = ? AND is_active = 1'
      )
      .get(userId) as UserPublicRow | undefined;
  },

  /** Returns the first active user. Used for single-user mode lookups. */
  getFirstUser(): UserPublicRow | undefined {
    const db = getConnection();
    return db
      .prepare(
        'SELECT id, username, created_at, last_login, role FROM users WHERE is_active = 1 LIMIT 1'
      )
      .get() as UserPublicRow | undefined;
  },

  /** Lists every user (active or not) for the admin management panel. */
  listUsers(): UserAdminRow[] {
    const db = getConnection();
    return db
      .prepare(
        'SELECT id, username, created_at, last_login, is_active, role FROM users ORDER BY id ASC'
      )
      .all() as UserAdminRow[];
  },

  /** Enables or disables an account (disabled users cannot log in). */
  setActive(userId: number, isActive: boolean): void {
    const db = getConnection();
    db.prepare('UPDATE users SET is_active = ? WHERE id = ?').run(
      isActive ? 1 : 0,
      userId
    );
  },

  /** Changes a user's role between 'admin' and 'member'. */
  setRole(userId: number, role: 'admin' | 'member'): void {
    const db = getConnection();
    db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, userId);
  },

  /** Permanently deletes a user (project grants cascade via foreign key). */
  deleteUser(userId: number): void {
    const db = getConnection();
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  },

  /** Counts how many admins currently exist (used to prevent lockout). */
  countAdmins(): number {
    const db = getConnection();
    const row = db
      .prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin' AND is_active = 1")
      .get() as { count: number };
    return row.count;
  },

  /** Stores the user's preferred git name and email. */
  updateGitConfig(
    userId: number,
    gitName: string,
    gitEmail: string
  ): void {
    const db = getConnection();
    db.prepare('UPDATE users SET git_name = ?, git_email = ? WHERE id = ?').run(
      gitName,
      gitEmail,
      userId
    );
  },

  /** Retrieves the user's git identity (name + email). */
  getGitConfig(userId: number): UserGitConfig | undefined {
    const db = getConnection();
    return db
      .prepare('SELECT git_name, git_email FROM users WHERE id = ?')
      .get(userId) as UserGitConfig | undefined;
  },

  /** Marks onboarding as complete for the given user. */
  completeOnboarding(userId: number): void {
    const db = getConnection();
    db.prepare(
      'UPDATE users SET has_completed_onboarding = 1 WHERE id = ?'
    ).run(userId);
  },

  /** Returns true if the user has finished the onboarding flow. */
  hasCompletedOnboarding(userId: number): boolean {
    const db = getConnection();
    const row = db
      .prepare('SELECT has_completed_onboarding FROM users WHERE id = ?')
      .get(userId) as { has_completed_onboarding: number } | undefined;
    return row?.has_completed_onboarding === 1;
  },
};
