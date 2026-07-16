/**
 * Activity log repository (multi-user audit trail).
 *
 * Records coarse-grained, security-relevant actions — login, opening the AI in
 * a project, opening a terminal, deleting a project — so an admin can see who
 * touched what. Writes are best-effort and never throw into the request path.
 */

import { getConnection } from '@/modules/database/connection.js';

export type ActivityLogRow = {
  id: number;
  user_id: number | null;
  username: string | null;
  action: string;
  project_id: string | null;
  project_name: string | null;
  detail: string | null;
  created_at: string;
};

type RecordActivityInput = {
  userId?: number | string | null;
  username?: string | null;
  action: string;
  projectId?: string | null;
  projectName?: string | null;
  detail?: string | null;
};

export const activityLogDb = {
  /** Inserts one audit entry. Best-effort: logs and swallows failures. */
  record(entry: RecordActivityInput): void {
    try {
      const db = getConnection();
      const numericUserId =
        entry.userId === null || entry.userId === undefined
          ? null
          : Number(entry.userId);
      db.prepare(
        `INSERT INTO activity_log (user_id, username, action, project_id, project_name, detail)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(
        Number.isFinite(numericUserId as number) ? numericUserId : null,
        entry.username ?? null,
        entry.action,
        entry.projectId ?? null,
        entry.projectName ?? null,
        entry.detail ?? null
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Failed to record activity', { error: message });
    }
  },

  /**
   * Returns the most recent entries (newest first), capped by `limit`.
   * Falls back to the user's current username when none was snapshotted.
   */
  list(limit = 100): ActivityLogRow[] {
    const db = getConnection();
    const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 500) : 100;
    return db
      .prepare(
        `SELECT a.id, a.user_id, COALESCE(a.username, u.username) AS username,
                a.action, a.project_id, a.project_name, a.detail, a.created_at
         FROM activity_log a
         LEFT JOIN users u ON u.id = a.user_id
         ORDER BY a.id DESC
         LIMIT ?`
      )
      .all(safeLimit) as ActivityLogRow[];
  },
};
