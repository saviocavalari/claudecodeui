/**
 * Admin routes: user management and per-user project access.
 *
 * Mounted behind `authenticateToken` + `requireUserManager`, so admins and
 * supervisors reach this router. Admins can do everything. Supervisors only
 * see members: they can grant/revoke to them the projects the supervisor was
 * granted, enable/disable them and answer their password reset requests;
 * every other route is guarded with `requireAdmin`.
 */

import path from 'node:path';

import spawn from 'cross-spawn';
import express from 'express';

import {
  activityLogDb,
  passwordResetsDb,
  projectAccessDb,
  projectsDb,
  userDb,
} from '@/modules/database/index.js';

import { isAdmin, requireAdmin } from './project-access.js';

const router = express.Router();

const CLOUDCLI_SERVICE_NAME = process.env.CLOUDCLI_SYSTEMD_SERVICE || 'claude-chat';

function runSystemctl(args) {
  return new Promise((resolve) => {
    const child = spawn('sudo', ['-n', 'systemctl', ...args], {
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let errorOutput = '';
    child.stderr.on('data', (chunk) => { errorOutput += chunk.toString(); });
    child.on('error', (error) => resolve({ ok: false, error: error.message }));
    child.on('close', (code) => resolve({
      ok: code === 0,
      error: errorOutput.trim() || `systemctl exited with code ${code}`,
    }));
  });
}

const ROLES = new Set(['admin', 'supervisor', 'member']);

/** Projects the caller may hand out: null = all (admin), else the own grants. */
function grantableProjectIds(user) {
  if (isAdmin(user)) return null;
  return new Set(projectAccessDb.listProjectIdsForUser(user.id));
}

function findUser(userId) {
  return userDb.listUsers().find((u) => u.id === userId);
}

/** Supervisors may only manage plain members. */
function canManageTarget(caller, target) {
  if (!target) return false;
  if (isAdmin(caller)) return true;
  return target.role === 'member';
}

function projectDisplayName(row) {
  const custom = (row.custom_project_name || '').trim();
  if (custom) return custom;
  return path.basename(row.project_path) || row.project_path;
}

// List every user with the project ids currently granted to them.
router.get('/users', (req, res) => {
  try {
    const grantable = grantableProjectIds(req.user);
    const users = userDb.listUsers()
      .filter((user) => canManageTarget(req.user, user))
      .map((user) => {
        let projectIds = user.role === 'admin'
          ? 'all'
          : projectAccessDb.listProjectIdsForUser(user.id);
        // A supervisor only sees grants for the projects they can hand out.
        if (grantable && Array.isArray(projectIds)) {
          projectIds = projectIds.filter((id) => grantable.has(id));
        }
        return {
          ...user,
          is_active: Boolean(user.is_active),
          can_use_global_provider_account: Boolean(user.can_use_global_provider_account),
          projectIds,
        };
      });
    res.json({ users });
  } catch (error) {
    console.error('[admin] list users error:', error);
    res.status(500).json({ error: 'Failed to list users' });
  }
});

// How many active members are still waiting for a project to be granted.
// Used to badge the settings icon so the admin notices new signups.
router.get('/pending-count', (req, res) => {
  try {
    // Signups waiting for projects are always plain members, so they count for
    // supervisors too; reset requests only count when the caller can answer them.
    const resets = passwordResetsDb.list()
      .filter((request) => canManageTarget(req.user, { role: request.role })).length;
    res.json({ pending: userDb.countPendingMembers() + resets });
  } catch (error) {
    console.error('[admin] pending count error:', error);
    res.status(500).json({ error: 'Failed to count pending users' });
  }
});

// Recent activity (who did what, when) for the audit panel.
router.get('/activity', requireAdmin, (req, res) => {
  try {
    const limit = Number(req.query.limit) || 100;
    res.json({ activity: activityLogDb.list(limit) });
  } catch (error) {
    console.error('[admin] activity error:', error);
    res.status(500).json({ error: 'Failed to load activity' });
  }
});

// Restart only the CloudCLI web service. The route is mounted behind the
// admin guard, verifies non-interactive systemd access first, and returns
// before the current process is stopped so the browser can enter reconnect mode.
router.post('/restart', requireAdmin, async (req, res) => {
  const preflight = await runSystemctl(['is-active', '--quiet', CLOUDCLI_SERVICE_NAME]);
  if (!preflight.ok) {
    console.error('[admin] restart preflight failed:', preflight.error);
    return res.status(503).json({
      error: 'CloudCLI restart is not available in this environment.',
      detail: preflight.error,
    });
  }

  res.status(202).json({ success: true, message: 'CloudCLI is restarting.' });
  setTimeout(() => {
    const child = spawn('sudo', ['-n', 'systemctl', 'restart', CLOUDCLI_SERVICE_NAME], {
      detached: true,
      stdio: 'ignore',
    });
    child.on('error', (error) => console.error('[admin] restart failed:', error.message));
    child.unref();
  }, 500);
});

// List all active projects (for the access checkboxes in the admin UI).
router.get('/projects', (req, res) => {
  try {
    const grantable = grantableProjectIds(req.user);
    const projects = projectsDb.getProjectPaths()
      .filter((row) => !grantable || grantable.has(row.project_id))
      .map((row) => ({
      projectId: row.project_id,
      name: projectDisplayName(row),
      path: row.project_path,
    }));
    projects.sort((a, b) => a.name.localeCompare(b.name));
    res.json({ projects });
  } catch (error) {
    console.error('[admin] list projects error:', error);
    res.status(500).json({ error: 'Failed to list projects' });
  }
});

// Enable or disable a user account.
router.post('/users/:id/active', (req, res) => {
  try {
    const userId = Number(req.params.id);
    const isActive = Boolean(req.body?.isActive);
    const target = findUser(userId);
    if (!target) {
      return res.status(404).json({ error: 'User not found.' });
    }
    // Supervisors may only switch plain members on/off.
    if (!canManageTarget(req.user, target)) {
      return res.status(403).json({ error: 'You cannot manage this user.' });
    }

    if (userId === req.user.id && !isActive) {
      return res.status(400).json({ error: 'You cannot deactivate your own account.' });
    }
    // Never allow disabling the last remaining admin.
    if (!isActive && target.role === 'admin' && userDb.countAdmins() <= 1) {
      return res.status(400).json({ error: 'Cannot deactivate the last admin.' });
    }

    userDb.setActive(userId, isActive);
    activityLogDb.record({
      userId: req.user.id,
      username: req.user.username,
      action: isActive ? 'user.activate' : 'user.deactivate',
      detail: `${target.username}: ${isActive ? 'ativado' : 'desativado'}`,
    });
    res.json({ success: true });
  } catch (error) {
    console.error('[admin] set active error:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// Change a user's role ('admin', 'supervisor' or 'member').
router.post('/users/:id/role', requireAdmin, (req, res) => {
  try {
    const userId = Number(req.params.id);
    const role = ROLES.has(req.body?.role) ? req.body.role : 'member';

    // Prevent removing the last admin (which would lock everyone out of admin).
    if (role !== 'admin') {
      const target = userDb.listUsers().find((u) => u.id === userId);
      if (target?.role === 'admin' && userDb.countAdmins() <= 1) {
        return res.status(400).json({ error: 'Cannot demote the last admin.' });
      }
    }

    userDb.setRole(userId, role);
    res.json({ success: true });
  } catch (error) {
    console.error('[admin] set role error:', error);
    res.status(500).json({ error: 'Failed to update role' });
  }
});

// Grant or revoke use of the host-level Claude/Codex account for one user.
router.post('/users/:id/global-provider-account', requireAdmin, (req, res) => {
  try {
    const userId = Number(req.params.id);
    const allowed = req.body?.allowed;
    if (!Number.isInteger(userId) || typeof allowed !== 'boolean') {
      return res.status(400).json({
        error: 'A valid user id and boolean allowed value are required.',
      });
    }

    const target = userDb.listUsers().find((user) => user.id === userId);
    if (!target) {
      return res.status(404).json({ error: 'User not found.' });
    }

    userDb.setGlobalProviderAccountAccess(userId, allowed);
    activityLogDb.record({
      userId: req.user.id,
      username: req.user.username,
      action: 'user.global_provider_account',
      detail: `${target.username}: ${allowed ? 'liberado' : 'revogado'}`,
    });
    res.json({ success: true, allowed });
  } catch (error) {
    console.error('[admin] set global provider account access error:', error);
    res.status(500).json({ error: 'Failed to update global provider account access' });
  }
});

// Replace the full set of projects a user can access.
router.put('/users/:id/projects', (req, res) => {
  try {
    const userId = Number(req.params.id);
    const requested = Array.isArray(req.body?.projectIds)
      ? req.body.projectIds.map((id) => String(id))
      : [];
    if (!canManageTarget(req.user, findUser(userId))) {
      return res.status(403).json({ error: 'You cannot manage this user.' });
    }

    const grantable = grantableProjectIds(req.user);
    let projectIds = requested;
    if (grantable) {
      // Supervisor: only the projects they hold change; grants outside their
      // reach (given by an admin) are kept untouched.
      const kept = projectAccessDb.listProjectIdsForUser(userId)
        .filter((id) => !grantable.has(id));
      const allowed = requested.filter((id) => grantable.has(id));
      projectIds = Array.from(new Set([...kept, ...allowed]));
    }
    projectAccessDb.setProjectsForUser(userId, projectIds);
    activityLogDb.record({
      userId: req.user.id,
      username: req.user.username,
      action: 'user.projects',
      detail: `${findUser(userId)?.username ?? userId}: ${projectIds.length} projeto(s)`,
    });
    res.json({ success: true, projectIds });
  } catch (error) {
    console.error('[admin] set projects error:', error);
    res.status(500).json({ error: 'Failed to update project access' });
  }
});

// Grant access to a single project.
router.post('/users/:id/projects/:projectId', (req, res) => {
  try {
    const userId = Number(req.params.id);
    const projectId = String(req.params.projectId);
    const grantable = grantableProjectIds(req.user);
    if (!canManageTarget(req.user, findUser(userId)) || (grantable && !grantable.has(projectId))) {
      return res.status(403).json({ error: 'You cannot manage this access.' });
    }
    projectAccessDb.grant(userId, projectId);
    res.json({ success: true });
  } catch (error) {
    console.error('[admin] grant error:', error);
    res.status(500).json({ error: 'Failed to grant access' });
  }
});

// Revoke access to a single project.
router.delete('/users/:id/projects/:projectId', (req, res) => {
  try {
    const userId = Number(req.params.id);
    const projectId = String(req.params.projectId);
    const grantable = grantableProjectIds(req.user);
    if (!canManageTarget(req.user, findUser(userId)) || (grantable && !grantable.has(projectId))) {
      return res.status(403).json({ error: 'You cannot manage this access.' });
    }
    projectAccessDb.revoke(userId, projectId);
    res.json({ success: true });
  } catch (error) {
    console.error('[admin] revoke error:', error);
    res.status(500).json({ error: 'Failed to revoke access' });
  }
});

// "Forgot my password" requests the caller can act on.
router.get('/password-resets', (req, res) => {
  try {
    const requests = passwordResetsDb.list()
      .filter((request) => canManageTarget(req.user, { role: request.role }));
    res.json({ requests });
  } catch (error) {
    console.error('[admin] list password resets error:', error);
    res.status(500).json({ error: 'Failed to list password reset requests' });
  }
});

// Approve: the password the person typed on the login screen becomes valid.
router.post('/password-resets/:id/approve', (req, res) => {
  try {
    const request = passwordResetsDb.getById(Number(req.params.id));
    const target = request ? userDb.listUsers().find((u) => u.id === request.user_id) : null;
    if (!request || !target) {
      return res.status(404).json({ error: 'Request not found.' });
    }
    if (!canManageTarget(req.user, target)) {
      return res.status(403).json({ error: 'You cannot manage this user.' });
    }
    userDb.updatePassword(target.id, request.password_hash);
    passwordResetsDb.remove(request.id);
    activityLogDb.record({
      userId: req.user.id,
      username: req.user.username,
      action: 'password.reset_approved',
      detail: `nova senha de ${target.username} aprovada`,
    });
    res.json({ success: true });
  } catch (error) {
    console.error('[admin] approve password reset error:', error);
    res.status(500).json({ error: 'Failed to approve password reset' });
  }
});

// Reject: discard the request; the old password keeps working.
router.delete('/password-resets/:id', (req, res) => {
  try {
    const request = passwordResetsDb.getById(Number(req.params.id));
    const target = request ? userDb.listUsers().find((u) => u.id === request.user_id) : null;
    if (!request || !target) {
      return res.status(404).json({ error: 'Request not found.' });
    }
    if (!canManageTarget(req.user, target)) {
      return res.status(403).json({ error: 'You cannot manage this user.' });
    }
    passwordResetsDb.remove(request.id);
    activityLogDb.record({
      userId: req.user.id,
      username: req.user.username,
      action: 'password.reset_rejected',
      detail: `pedido de nova senha de ${target.username} recusado`,
    });
    res.json({ success: true });
  } catch (error) {
    console.error('[admin] reject password reset error:', error);
    res.status(500).json({ error: 'Failed to reject password reset' });
  }
});

// Delete a user account entirely (cascades project grants).
router.delete('/users/:id', requireAdmin, (req, res) => {
  try {
    const userId = Number(req.params.id);
    if (userId === req.user.id) {
      return res.status(400).json({ error: 'You cannot delete your own account.' });
    }
    const target = userDb.listUsers().find((u) => u.id === userId);
    if (target?.role === 'admin' && userDb.countAdmins() <= 1) {
      return res.status(400).json({ error: 'Cannot delete the last admin.' });
    }
    userDb.deleteUser(userId);
    res.json({ success: true });
  } catch (error) {
    console.error('[admin] delete user error:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

export default router;
