/**
 * Password reset requests ("esqueci minha senha").
 *
 * The person who forgot the password chooses the new one on the login screen;
 * the hash waits here until an admin (or the member's supervisor) approves it,
 * since the installation has no e-mail channel to prove who is asking.
 */

import { getConnection } from '@/modules/database/connection.js';

export type PasswordResetRequestRow = {
  id: number;
  user_id: number;
  username: string;
  role: string;
  created_at: string;
};

export const passwordResetsDb = {
  /** Creates or replaces the single pending request of a user. */
  upsert(userId: number, passwordHash: string): void {
    const db = getConnection();
    db.prepare(
      `INSERT INTO password_reset_requests (user_id, password_hash, created_at)
       VALUES (?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(user_id) DO UPDATE SET
         password_hash = excluded.password_hash,
         created_at = CURRENT_TIMESTAMP`
    ).run(userId, passwordHash);
  },

  /** Pending requests with the requester's username and role (no hashes). */
  list(): PasswordResetRequestRow[] {
    const db = getConnection();
    return db
      .prepare(
        `SELECT r.id, r.user_id, u.username, u.role, r.created_at
         FROM password_reset_requests r
         JOIN users u ON u.id = r.user_id
         ORDER BY r.created_at DESC`
      )
      .all() as PasswordResetRequestRow[];
  },

  getById(id: number): { id: number; user_id: number; password_hash: string } | undefined {
    const db = getConnection();
    return db
      .prepare('SELECT id, user_id, password_hash FROM password_reset_requests WHERE id = ?')
      .get(id) as { id: number; user_id: number; password_hash: string } | undefined;
  },

  remove(id: number): void {
    const db = getConnection();
    db.prepare('DELETE FROM password_reset_requests WHERE id = ?').run(id);
  },

  count(): number {
    const db = getConnection();
    const row = db.prepare('SELECT COUNT(*) as count FROM password_reset_requests').get() as {
      count: number;
    };
    return row.count;
  },
};
