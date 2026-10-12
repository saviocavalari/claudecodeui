import assert from 'node:assert/strict';

import { test } from 'vitest';

import { i18n } from '@/modules/i18n';
import {
  KNOWN_SERVER_MESSAGES,
  localizeAction,
  localizeServerMessage,
} from '@/modules/browser-use/browserUseServerText';

// Stands in for i18next: the translation when the key exists, else defaultValue.
const translateWith = (messages: Record<string, string>) =>
  (key: string, options?: Record<string, unknown>) => messages[key] ?? String(options?.defaultValue ?? key);

test('actions fall back to the readable slug when the locale has no translation', () => {
  const t = translateWith({});

  assert.equal(localizeAction('fill_form', t), 'fill form');
  assert.equal(localizeAction('navigate:https://example.com/a', t), 'navigate: https://example.com/a');
});

test('actions are translated without touching the detail after the first colon', () => {
  const t = translateWith({
    'browserUse.actions.navigate': 'navegação',
    'browserUse.actions.press_key': 'tecla',
  });

  assert.equal(localizeAction('navigate:https://example.com:8080/a', t), 'navegação: https://example.com:8080/a');
  assert.equal(localizeAction('press_key:Enter', t), 'tecla: Enter');
});

test('unknown or missing server messages pass through unchanged', () => {
  const t = translateWith({});

  assert.equal(localizeServerMessage('Something new from the server.', t), 'Something new from the server.');
  assert.equal(localizeServerMessage('Browser session is ready.', t), 'Browser session is ready.');
  assert.equal(localizeServerMessage(null, t), '');
});

// Guards the pairing between the sentences above and the locale file: a
// mistyped slug would silently leave that message in English.
test('pt-BR translates every server message and action the panel knows', () => {
  const t = i18n.getFixedT('pt-BR', 'settings') as (key: string, options?: Record<string, unknown>) => string;

  for (const message of KNOWN_SERVER_MESSAGES) {
    assert.notEqual(localizeServerMessage(message, t), message, message);
  }

  const actions = ['create', 'navigate', 'click', 'type', 'fill_form', 'press_key', 'select_option', 'wait_for', 'stop', 'expire', 'shutdown'];
  for (const action of actions) {
    assert.notEqual(localizeAction(action, t), action.replace(/_/g, ' '), action);
  }
});
