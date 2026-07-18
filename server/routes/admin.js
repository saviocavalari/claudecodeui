/**
 * Admin routes: user management and per-user project access.
 *
 * Every route here is mounted behind `authenticateToken` + `requireAdmin`, so
 * only the installation owner (an admin) can list users, enable/disable them,
 * change roles, and grant/revoke which projects each member can work on.
 */

import express from 'express';
import path from 'node:path';
import spawn from 'cross-spawn';

import { userDb, projectAccessDb, projectsDb, activityLogDb } from '../modules/database/index.js';

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

function projectDisplayName(row) {
  const custom = (row.custom_project_name || '').trim();
  if (custom) return custom;
  return path.basename(row.project_path) || row.project_path;
}

// List every user with the project ids currently granted to them.
router.get('/users', (req, res) => {
  try {
    const users = userDb.listUsers().map((user) => ({
      ...user,
      is_active: Boolean(user.is_active),
      projectIds:
        user.role === 'admin'
          ? 'all'
          : projectAccessDb.listProjectIdsForUser(user.id),
    }));
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
    res.json({ pending: userDb.countPendingMembers() });
  } catch (error) {
    console.error('[admin] pending count error:', error);
    res.status(500).json({ error: 'Failed to count pending users' });
  }
});

// Recent activity (who did what, when) for the audit panel.
router.get('/activity', (req, res) => {
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
router.post('/restart', async (req, res) => {
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
    const projects = projectsDb.getProjectPaths().map((row) => ({
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

    if (userId === req.user.id && !isActive) {
      return res.status(400).json({ error: 'You cannot deactivate your own account.' });
    }
    // Never allow disabling the last remaining admin.
    if (!isActive) {
      const target = userDb.listUsers().find((u) => u.id === userId);
      if (target?.role === 'admin' && userDb.countAdmins() <= 1) {
        return res.status(400).json({ error: 'Cannot deactivate the last admin.' });
      }
    }

    userDb.setActive(userId, isActive);
    res.json({ success: true });
  } catch (error) {
    console.error('[admin] set active error:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// Change a user's role between 'admin' and 'member'.
router.post('/users/:id/role', (req, res) => {
  try {
    const userId = Number(req.params.id);
    const role = req.body?.role === 'admin' ? 'admin' : 'member';

    // Prevent removing the last admin (which would lock everyone out of admin).
    if (role === 'member') {
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

// Replace the full set of projects a user can access.
router.put('/users/:id/projects', (req, res) => {
  try {
    const userId = Number(req.params.id);
    const projectIds = Array.isArray(req.body?.projectIds)
      ? req.body.projectIds.map((id) => String(id))
      : [];
    projectAccessDb.setProjectsForUser(userId, projectIds);
    res.json({ success: true, projectIds });
  } catch (error) {
    console.error('[admin] set projects error:', error);
    res.status(500).json({ error: 'Failed to update project access' });
  }
});

// Grant access to a single project.
router.post('/users/:id/projects/:projectId', (req, res) => {
  try {
    projectAccessDb.grant(Number(req.params.id), String(req.params.projectId));
    res.json({ success: true });
  } catch (error) {
    console.error('[admin] grant error:', error);
    res.status(500).json({ error: 'Failed to grant access' });
  }
});

// Revoke access to a single project.
router.delete('/users/:id/projects/:projectId', (req, res) => {
  try {
    projectAccessDb.revoke(Number(req.params.id), String(req.params.projectId));
    res.json({ success: true });
  } catch (error) {
    console.error('[admin] revoke error:', error);
    res.status(500).json({ error: 'Failed to revoke access' });
  }
});

// Delete a user account entirely (cascades project grants).
router.delete('/users/:id', (req, res) => {
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
