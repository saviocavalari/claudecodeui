import express from 'express';
import type { Request, Response } from 'express';

import { browserUseService } from '@/modules/browser-use/browser-use.service.js';
import { parseBrowserManualAction } from '@/modules/browser-use/browser-manual-input.js';
import type { BrowserSessionUser } from '@/shared/types.js';

const router = express.Router();

/**
 * Stable machine-readable error codes for the browser-use API.
 *
 * The server always replies with the structured envelope used by AppError
 * (`{ success: false, error: { code, message, details } }`). Clients map
 * `code` to localized copy; `message` is an English fallback and `details`
 * may carry the underlying error text for diagnostics.
 */
export const BROWSER_USE_ERROR_CODES = {
  STATUS_LOAD_FAILED: 'BROWSER_USE_STATUS_LOAD_FAILED',
  SETTINGS_LOAD_FAILED: 'BROWSER_USE_SETTINGS_LOAD_FAILED',
  SETTINGS_SAVE_FAILED: 'BROWSER_USE_SETTINGS_SAVE_FAILED',
  RUNTIME_INSTALL_FAILED: 'BROWSER_USE_RUNTIME_INSTALL_FAILED',
  SESSIONS_LOAD_FAILED: 'BROWSER_USE_SESSIONS_LOAD_FAILED',
  SESSION_STOP_FAILED: 'BROWSER_USE_SESSION_STOP_FAILED',
  SESSION_DELETE_FAILED: 'BROWSER_USE_SESSION_DELETE_FAILED',
} as const;

function sendError(
  res: Response,
  statusCode: number,
  code: string,
  message: string,
  details?: unknown,
): void {
  res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
      details,
    },
  });
}

function readParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] || '' : value || '';
}

router.get('/status', async (_req, res) => {
  try {
    res.json({ success: true, data: await browserUseService.getStatus() });
  } catch (error) {
    sendError(
      res,
      500,
      BROWSER_USE_ERROR_CODES.STATUS_LOAD_FAILED,
      'Failed to load Browser status.',
      error instanceof Error ? error.message : undefined,
    );
  }
});

router.get('/settings', async (_req, res) => {
  try {
    res.json({ success: true, data: { settings: await browserUseService.getSettings() } });
  } catch (error) {
    sendError(
      res,
      500,
      BROWSER_USE_ERROR_CODES.SETTINGS_LOAD_FAILED,
      'Failed to load Browser settings.',
      error instanceof Error ? error.message : undefined,
    );
  }
});

router.put('/settings', async (req, res) => {
  try {
    const settings = await browserUseService.updateSettings(req.body || {});
    res.json({ success: true, data: { settings } });
  } catch (error) {
    sendError(
      res,
      400,
      BROWSER_USE_ERROR_CODES.SETTINGS_SAVE_FAILED,
      'Failed to save Browser settings.',
      error instanceof Error ? error.message : undefined,
    );
  }
});

router.post('/runtime/install', async (_req, res) => {
  try {
    const result = await browserUseService.installRuntime();
    if (result.success) {
      res.json({ success: true, data: result });
      return;
    }
    sendError(
      res,
      500,
      BROWSER_USE_ERROR_CODES.RUNTIME_INSTALL_FAILED,
      'Failed to install Browser runtime.',
      result.message,
    );
  } catch (error) {
    sendError(
      res,
      500,
      BROWSER_USE_ERROR_CODES.RUNTIME_INSTALL_FAILED,
      'Failed to install Browser runtime.',
      error instanceof Error ? error.message : undefined,
    );
  }
});

router.get('/sessions', async (req, res) => {
  try {
    res.json({ success: true, data: { sessions: await browserUseService.listSessions(requestUser(req)) } });
  } catch (error) {
    sendError(
      res,
      401,
      BROWSER_USE_ERROR_CODES.SESSIONS_LOAD_FAILED,
      'Failed to list browser sessions.',
      error instanceof Error ? error.message : undefined,
    );
  }
});

// These routes are mounted behind authenticateToken in server/index.ts.
function requestUser(req: Request): BrowserSessionUser {
  const user = (req as Request & { user?: { id?: string | number; role?: string } }).user;
  if (!user?.id) throw new Error('Authentication required.');
  return { id: String(user.id), isAdmin: user.role === 'admin' };
}

router.post('/sessions', async (req, res) => {
  try {
    const session = await browserUseService.createManualSession(requestUser(req).id);
    res.json({ success: true, data: { session } });
  } catch {
    sendError(res, 400, 'BROWSER_USE_MANUAL_FAILED', 'Unable to create browser session.');
  }
});

router.post('/sessions/:sessionId/input', async (req, res) => {
  try {
    const input = parseBrowserManualAction(req.body);
    const result = await browserUseService.manualAction(readParam(req.params.sessionId), requestUser(req), input);
    res.setHeader('Cache-Control', 'no-store');
    res.json({ success: true, data: result });
  } catch {
    // Do not echo browser/runtime errors: they may contain typed credentials.
    sendError(res, 400, 'BROWSER_USE_MANUAL_FAILED', 'Browser action failed. Check the session and take control again.');
  }
});

router.post('/sessions/:sessionId/stop', async (req, res) => {
  try {
    const result = await browserUseService.stopSession(readParam(req.params.sessionId));
    res.json({ success: true, data: result });
  } catch (error) {
    sendError(
      res,
      400,
      BROWSER_USE_ERROR_CODES.SESSION_STOP_FAILED,
      'Failed to stop browser session.',
      error instanceof Error ? error.message : undefined,
    );
  }
});

router.delete('/sessions/:sessionId', async (req, res) => {
  try {
    const result = await browserUseService.deleteSession(readParam(req.params.sessionId));
    res.json({ success: true, data: result });
  } catch (error) {
    sendError(
      res,
      400,
      BROWSER_USE_ERROR_CODES.SESSION_DELETE_FAILED,
      'Failed to delete browser session.',
      error instanceof Error ? error.message : undefined,
    );
  }
});

export default router;
