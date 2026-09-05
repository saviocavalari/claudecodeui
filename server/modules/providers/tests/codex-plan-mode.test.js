import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyCodexPlanMode,
  CODEX_PLAN_MODE_INSTRUCTION,
  mapPermissionModeToCodexOptions,
} from '@/modules/providers/list/codex/codex-runtime.provider.js';
import { stripPlanModeTag } from '@/shared/utils.js';

test('mapPermissionModeToCodexOptions maps UI permission modes onto Codex sandbox controls', () => {
  assert.deepEqual(mapPermissionModeToCodexOptions('plan'), {
    sandboxMode: 'read-only',
    approvalPolicy: 'never',
  });
  assert.deepEqual(mapPermissionModeToCodexOptions('acceptEdits'), {
    sandboxMode: 'workspace-write',
    approvalPolicy: 'never',
  });
  assert.deepEqual(mapPermissionModeToCodexOptions('bypassPermissions'), {
    sandboxMode: 'danger-full-access',
    approvalPolicy: 'never',
  });
  assert.deepEqual(mapPermissionModeToCodexOptions('default'), {
    sandboxMode: 'workspace-write',
    approvalPolicy: 'untrusted',
  });
  assert.deepEqual(mapPermissionModeToCodexOptions(undefined), {
    sandboxMode: 'workspace-write',
    approvalPolicy: 'untrusted',
  });
});

test('applyCodexPlanMode prefixes the plan instruction only in plan mode', () => {
  const prompt = 'Refactor the auth flow';

  assert.equal(applyCodexPlanMode(prompt, 'plan'), `${CODEX_PLAN_MODE_INSTRUCTION}\n\n${prompt}`);
  assert.equal(applyCodexPlanMode(prompt, 'default'), prompt);
  assert.equal(applyCodexPlanMode(prompt, undefined), prompt);
});

test('stripPlanModeTag reverses the plan-mode prefix and leaves other text alone', () => {
  const prompt = 'Refactor the auth flow';

  assert.equal(stripPlanModeTag(applyCodexPlanMode(prompt, 'plan')), prompt);
  assert.equal(stripPlanModeTag(prompt), prompt);
  assert.equal(stripPlanModeTag('mentions <plan_mode> mid-text'), 'mentions <plan_mode> mid-text');
});
