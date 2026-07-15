/**
 * Cross-repository authorization check for multi-user project access.
 *
 * Lives inside the database module so domain code (websocket chat/shell
 * handlers, provider routes) can enforce access without depending on the
 * Express middleware layer. Admins pass unconditionally; members must have an
 * explicit grant in `user_projects`.
 */

import { projectAccessDb } from '@/modules/database/repositories/project-access.db.js';
import { projectsDb } from '@/modules/database/repositories/projects.db.js';
import { userDb } from '@/modules/database/repositories/users.js';

/**
 * Resolves a user's role and project grants from just a user id + project path.
 * Used where the caller only carries the user id (websocket connections).
 */
export function userIdCanAccessProjectPath(
  userId: string | number | null | undefined,
  projectPath: string | null | undefined
): boolean {
  if (userId === null || userId === undefined || !projectPath) {
    return false;
  }

  const numericUserId = Number(userId);
  if (!Number.isFinite(numericUserId)) {
    return false;
  }

  const user = userDb.getUserById(numericUserId);
  if (!user) {
    return false;
  }
  if (user.role === 'admin') {
    return true;
  }

  const project = projectsDb.getProjectPath(projectPath);
  if (!project) {
    return false;
  }
  return projectAccessDb.hasAccess(numericUserId, project.project_id);
}
