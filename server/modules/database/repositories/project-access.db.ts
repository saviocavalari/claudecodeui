/**
 * Project access repository (multi-user support).
 *
 * Stores which `member` users may see and operate on which projects. An
 * `admin` user bypasses this table entirely (handled by the authorization
 * helpers, not here). All lookups are keyed by the DB `project_id`.
 */

import { getConnection } from '@/modules/database/connection.js';

type ProjectIdRow = { project_id: string };
type UserIdRow = { user_id: number };

export const projectAccessDb = {
  /** Grants a member access to a project. Idempotent. */
  grant(userId: number, projectId: string): void {
    const db = getConnection();
    db.prepare(
      `INSERT INTO user_projects (user_id, project_id)
       VALUES (?, ?)
       ON CONFLICT(user_id, project_id) DO NOTHING`
    ).run(userId, projectId);
  },

  /** Revokes a member's access to a project. */
  revoke(userId: number, projectId: string): void {
    const db = getConnection();
    db.prepare(
      'DELETE FROM user_projects WHERE user_id = ? AND project_id = ?'
    ).run(userId, projectId);
  },

  /** Replaces the full set of projects a member can access in one transaction. */
  setProjectsForUser(userId: number, projectIds: string[]): void {
    const db = getConnection();
    const replace = db.transaction((ids: string[]) => {
      db.prepare('DELETE FROM user_projects WHERE user_id = ?').run(userId);
      const insert = db.prepare(
        'INSERT OR IGNORE INTO user_projects (user_id, project_id) VALUES (?, ?)'
      );
      for (const id of ids) {
        insert.run(userId, id);
      }
    });
    replace(projectIds);
  },

  /** Returns true when the member has been granted access to the project. */
  hasAccess(userId: number, projectId: string): boolean {
    const db = getConnection();
    const row = db
      .prepare(
        'SELECT 1 FROM user_projects WHERE user_id = ? AND project_id = ? LIMIT 1'
      )
      .get(userId, projectId);
    return Boolean(row);
  },

  /** Lists the project_ids a member can access. */
  listProjectIdsForUser(userId: number): string[] {
    const db = getConnection();
    const rows = db
      .prepare('SELECT project_id FROM user_projects WHERE user_id = ?')
      .all(userId) as ProjectIdRow[];
    return rows.map((row) => row.project_id);
  },

  /** Lists the user_ids that can access a given project. */
  listUserIdsForProject(projectId: string): number[] {
    const db = getConnection();
    const rows = db
      .prepare('SELECT user_id FROM user_projects WHERE project_id = ?')
      .all(projectId) as UserIdRow[];
    return rows.map((row) => row.user_id);
  },
};
