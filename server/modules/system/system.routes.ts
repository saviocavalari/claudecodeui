import express from 'express';

import { readProjectSecretsInventory } from './project-secrets.service.js';
import type { createSystemUpdateService } from './system.service.js';

/** Creates thin system routes that delegate update execution to the service. */
export function createSystemRouter(
  systemUpdateService: ReturnType<typeof createSystemUpdateService>,
): express.Router {
  const router = express.Router();

  router.post('/update', async (_request, response, next) => {
    try {
      const result = await systemUpdateService.updateSystem();
      response.status(result.success ? 200 : 500).json(result);
    } catch (error) {
      next(error);
    }
  });

  // Admin-only: variable NAMES declared per project env file, never values.
  router.get('/secrets', (request, response, next) => {
    const user = (request as express.Request & { user?: { role?: string } }).user;
    if (user?.role !== 'admin') {
      response.status(403).json({ error: 'Admin access required' });
      return;
    }

    try {
      response.json(readProjectSecretsInventory());
    } catch (error) {
      next(error);
    }
  });

  return router;
}
