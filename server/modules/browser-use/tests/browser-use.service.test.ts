import assert from 'node:assert/strict';
import test from 'node:test';

import { browserUseService, buildMcpApiUrl } from '@/modules/browser-use/browser-use.service.js';

test('browser monitor list starts empty without agent sessions', async () => {
  const sessions = await browserUseService.listSessions({ id: '1', isAdmin: true });

  assert.deepEqual(sessions, []);
});

test('MCP API URL uses loopback when the server listens on every interface', () => {
  assert.equal(buildMcpApiUrl({}), 'http://127.0.0.1:3001/api/browser-use-mcp');
  assert.equal(buildMcpApiUrl({ HOST: '0.0.0.0', SERVER_PORT: '8100' }), 'http://127.0.0.1:8100/api/browser-use-mcp');
  assert.equal(buildMcpApiUrl({ HOST: 'localhost', PORT: '4000' }), 'http://127.0.0.1:4000/api/browser-use-mcp');
});

test('MCP API URL follows HOST when the server is pinned to one interface', () => {
  // Loopback is refused in this setup, so the bridge must use the bound address.
  assert.equal(
    buildMcpApiUrl({ HOST: '172.18.0.1', SERVER_PORT: '8100' }),
    'http://172.18.0.1:8100/api/browser-use-mcp',
  );
  assert.equal(
    buildMcpApiUrl({ HOST: 'fd00::1', SERVER_PORT: '8100' }),
    'http://[fd00::1]:8100/api/browser-use-mcp',
  );
});
