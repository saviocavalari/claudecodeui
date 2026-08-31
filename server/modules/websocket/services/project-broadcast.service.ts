import { userIdCanAccessProjectPath } from '@/modules/database/index.js';
import type { RealtimeClientConnection } from '@/shared/types.js';

import { connectedClients, WS_OPEN_STATE } from './websocket-state.service.js';

export type ProjectScopedRealtimeClient = RealtimeClientConnection & {
  userId?: string | number | null;
};

export function attachUserToRealtimeClient(
  client: RealtimeClientConnection,
  userId: string | number | null,
): void {
  (client as ProjectScopedRealtimeClient).userId = userId;
}

function clientCanReceiveProjectEvent(
  client: RealtimeClientConnection,
  projectPath: string | null | undefined,
): boolean {
  if (!projectPath) {
    return true;
  }

  const userId = (client as ProjectScopedRealtimeClient).userId;
  if (userId === undefined) {
    return true;
  }

  return userIdCanAccessProjectPath(userId, projectPath);
}

export function broadcastToProjectClients(
  projectPath: string | null | undefined,
  payload: string,
): void {
  connectedClients.forEach((client) => {
    if (
      client.readyState === WS_OPEN_STATE
      && clientCanReceiveProjectEvent(client, projectPath)
    ) {
      client.send(payload);
    }
  });
}
