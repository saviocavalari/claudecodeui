import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

type BrowserService = typeof import('@/modules/browser-use/browser-use.service.js').browserUseService;

const OPENER_PAGE = `<!doctype html><button style="position:absolute;left:20px;top:20px;width:200px;height:60px" onclick="window.open('/popup','login','width=500,height=400')">Abrir login</button>`;
const POPUP_PAGE = `<!doctype html><button style="position:absolute;left:20px;top:20px;width:200px;height:60px" onclick="window.close()">Concluir login</button>`;
const FORM_PAGE = `<!doctype html><html><body style="margin:0;height:2400px"><input id="text" style="position:absolute;left:20px;top:20px;width:300px;height:40px" oninput="document.querySelector('#result').textContent=this.value"><div id="result" style="position:absolute;top:80px"></div><iframe style="position:absolute;left:400px;top:20px;width:200px;height:100px;border:0" srcdoc="<button style='width:150px;height:70px' onclick='this.textContent=\"Frame clicked\"'>Click me</button>"></iframe><input type="range" style="position:absolute;left:20px;top:180px;width:300px" oninput="document.querySelector('#range').textContent=this.value"><div id="range" style="position:absolute;top:220px"></div></body></html>`;

// Opt-in because Chromium is an optional dependency and CI need not install its binary.
const skip = process.env.TEST_BROWSER_RUNTIME !== '1';

async function withBrowserRuntime(run: (browserUseService: BrowserService, baseUrl: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'browser-manual-test-'));
  const previous = process.env.DATABASE_PATH;
  process.env.DATABASE_PATH = path.join(directory, 'auth.db');
  const { initializeDatabase, appConfigDb, closeConnection } = await import('@/modules/database/index.js');
  const { browserUseService } = await import('@/modules/browser-use/browser-use.service.js');
  const pages: Record<string, string> = { '/opener': OPENER_PAGE, '/popup': POPUP_PAGE };
  const server = createServer((req, res) => { res.setHeader('Content-Type', 'text/html'); res.end(pages[req.url ?? ''] ?? FORM_PAGE); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    await initializeDatabase();
    appConfigDb.set('browser_use_settings', JSON.stringify({ enabled: true }));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing fixture port');
    await run(browserUseService, `http://127.0.0.1:${address.port}`);
  } finally {
    await browserUseService.stopAllSessions();
    server.close();
    closeConnection();
    if (previous === undefined) delete process.env.DATABASE_PATH; else process.env.DATABASE_PATH = previous;
    await rm(directory, { recursive: true, force: true });
  }
}

test('manual runtime: Unicode, iframe click, drag, scrolling, agent handoff and controller isolation', { skip }, async () => {
  await withBrowserRuntime(async (browserUseService, baseUrl) => {
    const session = await browserUseService.createAgentSession();
    assert.equal(session.status, 'ready');
    const user = { id: 'test-user', isAdmin: false };
    const send = (input: Parameters<typeof browserUseService.manualAction>[2]) => browserUseService.manualAction(session.id, user, input);
    await assert.rejects(() => send({ action: 'text', text: 'not allowed' }));
    await send({ action: 'control', enabled: true });
    await assert.rejects(() => browserUseService.agentClick(session.id, { x: 20, y: 20 }), /Manual control/);
    await assert.rejects(() => browserUseService.manualAction(session.id, { id: 'other-user', isAdmin: false }, { action: 'control', enabled: true }), /another user/);
    await send({ action: 'navigate', url: baseUrl });
    await send({ action: 'pointer', points: [{ x: 100, y: 40 }] });
    // Concurrent HTTP requests must retain invocation order.
    await Promise.all([send({ action: 'text', text: 'Olá ' }), send({ action: 'text', text: 'Pharmes 🌿' })]);
    const typed = await send({ action: 'snapshot' });
    assert.equal(typed.session.lastAction, 'manual_text');
    assert.ok(!JSON.stringify(typed.session).includes('Olá'));
    await send({ action: 'pointer', points: [{ x: 450, y: 60 }] });
    await send({ action: 'pointer', points: [{ x: 170, y: 190 }, { x: 250, y: 190 }, { x: 300, y: 190 }] });
    await send({ action: 'scroll', x: 900, y: 600, deltaX: 0, deltaY: 700 });
    await send({ action: 'control', enabled: false });
    const snapshot = await browserUseService.agentSnapshot(session.id);
    assert.ok(snapshot.text.includes('Olá Pharmes 🌿'));
    await browserUseService.agentClick(session.id, { selector: '#text' });
    await browserUseService.agentPressKey(session.id, 'Control+A');
    await browserUseService.agentType(session.id, { text: 'Handoff works' });
    assert.ok((await browserUseService.agentSnapshot(session.id)).text.includes('Handoff works'));
  });
});

test('manual runtime: a login popup that closes itself leaves the session usable', { skip }, async () => {
  await withBrowserRuntime(async (browserUseService, baseUrl) => {
    const session = await browserUseService.createAgentSession();
    const user = { id: 'test-user', isAdmin: false };
    const send = (input: Parameters<typeof browserUseService.manualAction>[2]) => browserUseService.manualAction(session.id, user, input);
    await send({ action: 'control', enabled: true });
    await send({ action: 'navigate', url: `${baseUrl}/opener` });
    await send({ action: 'pointer', points: [{ x: 100, y: 40 }] });
    let { tabs } = await send({ action: 'snapshot' });
    for (let attempt = 0; tabs.length < 2 && attempt < 20; attempt += 1) {
      await new Promise(resolve => setTimeout(resolve, 100));
      ({ tabs } = await send({ action: 'snapshot' }));
    }
    assert.equal(tabs.length, 2);
    await send({ action: 'tab', index: 1 });
    await send({ action: 'pointer', points: [{ x: 100, y: 40 }] });
    const after = await send({ action: 'snapshot' });
    assert.equal(after.tabs.length, 1);
    assert.equal(after.tabs[0].active, true);
    assert.ok(after.session.url?.endsWith('/opener'));
    await send({ action: 'control', enabled: false });
    assert.ok((await browserUseService.agentSnapshot(session.id)).text.includes('Abrir login'));
  });
});

test('manual runtime: a personal session only opens to its owner or an admin', { skip }, async () => {
  await withBrowserRuntime(async (browserUseService) => {
    const ownerId = `test-${process.pid}`;
    const owner = { id: ownerId, isAdmin: false };
    const member = { id: 'other-user', isAdmin: false };
    const admin = { id: 'admin-user', isAdmin: true };
    try {
      const session = await browserUseService.createManualSession(ownerId);
      const canSee = async (user: typeof owner) => (await browserUseService.listSessions(user)).some(item => item.id === session.id);
      assert.equal(await canSee(owner), true);
      assert.equal(await canSee(admin), true);
      assert.equal(await canSee(member), false);
      await assert.rejects(() => browserUseService.manualAction(session.id, member, { action: 'control', enabled: true }), /not available/);
      await browserUseService.manualAction(session.id, owner, { action: 'control', enabled: true });
      await browserUseService.manualAction(session.id, owner, { action: 'control', enabled: false });
      await browserUseService.manualAction(session.id, admin, { action: 'control', enabled: true });
    } finally {
      await browserUseService.stopAllSessions();
      await rm(path.join(os.homedir(), '.cloudcli', 'browser-use', 'profiles', `manual-${ownerId}`), { recursive: true, force: true });
    }
  });
});
