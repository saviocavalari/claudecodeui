// authRoutes: used by the server entrypoint to mount public authentication endpoints.
export { authRoutes } from './auth.module.js';

// authenticateToken: used by the server entrypoint to protect authenticated API modules.
export { authenticateToken } from './auth.middleware.js';
// authenticateWebSocket: used by WebSocket setup to verify connection tokens.
export { authenticateWebSocket } from './auth.middleware.js';
// validateApiKey: used by the server entrypoint for optional API-wide key validation.
export { validateApiKey } from './auth.middleware.js';

// Multi-user authorization: admin-only guard plus the two project-access
// middlewares the server entrypoint and the file/git routes mount.
export {
  enforceProjectFieldAccess,
  enforceProjectIdAccess,
  requireAdmin,
} from './project-access.js';

// adminRoutes: user management and per-user project grants (admin only).
export { default as adminRoutes } from './admin.routes.js';
