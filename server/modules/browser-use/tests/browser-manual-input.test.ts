import assert from 'node:assert/strict';
import test from 'node:test';

import { canUseBrowserSession, parseBrowserManualAction, personalProfileName } from '@/modules/browser-use/browser-manual-input.js';

test('manual browser accepts bounded pointer paths, Unicode text and supported keys', () => {
  assert.deepEqual(parseBrowserManualAction({ action: 'pointer', points: [{ x: 12.5, y: 20 }, { x: 99, y: 20 }] }), { action: 'pointer', points: [{ x: 12.5, y: 20 }, { x: 99, y: 20 }] });
  assert.deepEqual(parseBrowserManualAction({ action: 'text', text: 'Olá 🌿' }), { action: 'text', text: 'Olá 🌿' });
  assert.deepEqual(parseBrowserManualAction({ action: 'key', key: 'Control+Shift+ArrowLeft' }), { action: 'key', key: 'Control+Shift+ArrowLeft' });
  assert.deepEqual(parseBrowserManualAction({ action: 'navigate', url: 'example.com' }), { action: 'navigate', url: 'https://example.com/' });
});

test('manual browser rejects malformed and unbounded input', () => {
  for (const value of [null, [], {}, { action: 'eval' }, { action: 'control', enabled: 'true' }, { action: 'navigate', url: 'javascript:alert(1)' }, { action: 'navigate', url: 'file:///etc/passwd' }, { action: 'pointer', points: [] }, { action: 'pointer', points: [{ x: -1, y: 0 }] }, { action: 'pointer', points: Array(201).fill({ x: 0, y: 0 }) }, { action: 'scroll', x: 1, y: 1, deltaX: NaN, deltaY: 0 }, { action: 'text', text: 'x'.repeat(10001) }, { action: 'key', key: 'F12' }, { action: 'tab', index: 1.5 }]) {
    assert.throws(() => parseBrowserManualAction(value));
  }
});

test('a personal browser session opens to its owner and admins, and agent sessions stay shared', () => {
  const owner = { id: '7', isAdmin: false };
  const member = { id: '8', isAdmin: false };
  const admin = { id: '1', isAdmin: true };

  assert.equal(canUseBrowserSession(personalProfileName('7'), owner), true);
  assert.equal(canUseBrowserSession(personalProfileName('7'), admin), true);
  assert.equal(canUseBrowserSession(personalProfileName('7'), member), false);
  assert.equal(canUseBrowserSession(personalProfileName('77'), owner), false);
  assert.equal(canUseBrowserSession('chat2desk', member), true);
  assert.equal(canUseBrowserSession(null, member), true);
});
