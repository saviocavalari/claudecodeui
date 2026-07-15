/**
 * Authorization helpers for multi-user project access.
 *
 * `admin` users bypass every check (they own the installation). `member` users
 * may only see and touch projects explicitly granted to them in the
 * `user_projects` table. These helpers are the single source of truth used by
 * the REST routes and the websocket (chat + shell) handlers alike.
 */

import { projectAccessDb, projectsDb } from '../modules/database/index.js';

/** True when the authenticated user is an admin. */
export function isAdmin(user) {
  return Boolean(user) && user.role === 'admin';
}

/** Access check by DB project_id. */
export function canAccessProjectId(user, projectId) {
  if (!user || !projectId) return false;
  if (user.role === 'admin') return true;
  return projectAccessDb.hasAccess(user.id, projectId);
}

/** Access check by absolute project path (resolves to a project_id first). */
export function canAccessProjectPath(user, projectPath) {
  if (!user || !projectPath) return false;
  if (user.role === 'admin') return true;
  const project = projectsDb.getProjectPath(projectPath);
  if (!project) return false;
  return projectAccessDb.hasAccess(user.id, project.project_id);
}

/**
 * Express middleware: enforce access to the `:projectId` route param.
 * Assumes `authenticateToken` already populated `req.user`.
 */
export function enforceProjectIdAccess(req, res, next) {
  const projectId = req.params?.projectId;
  // No project in the route -> nothing to gate here.
  if (!projectId) return next();
  if (canAccessProjectId(req.user, projectId)) return next();
  return res
    .status(403)
    .json({ error: 'You do not have access to this project.' });
}

/**
 * Express middleware for git-style routes that carry the project id in the
 * `project` query/body field instead of the URL.
 */
export function enforceProjectFieldAccess(req, res, next) {
  const projectId =
    (req.query && req.query.project) ||
    (req.body && req.body.project) ||
    null;
  // Some sub-routes (e.g. generic helpers) have no project — let those through;
  // the resource-specific handlers still resolve and validate the path.
  if (!projectId) return next();
  if (canAccessProjectId(req.user, projectId)) return next();
  return res
    .status(403)
    .json({ error: 'You do not have access to this project.' });
}

/** Express middleware: admin-only route guard. */
export function requireAdmin(req, res, next) {
  if (isAdmin(req.user)) return next();
  return res.status(403).json({ error: 'Admin privileges required.' });
}
