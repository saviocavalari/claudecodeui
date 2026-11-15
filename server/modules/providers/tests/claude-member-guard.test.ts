import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyMemberGuard,
  MEMBER_DISALLOWED_TOOLS,
} from '@/modules/providers/list/claude/claude-member-guard.js';

const baseOptions = () => ({
  mcpServers: { 'chrome-savio': { command: 'x' }, 'cloudcli-browser': { command: 'y' } },
  disallowedTools: ['Bash(rm:*)'],
  systemPrompt: { type: 'preset', preset: 'claude_code' },
});

test('applyMemberGuard leaves admin sessions untouched', () => {
  const options: Record<string, any> = baseOptions();
  applyMemberGuard(options, { restricted: false, username: 'savio' });
  assert.deepEqual(options, baseOptions());
});

test('applyMemberGuard strips the owner Chrome and denies sensitive paths for members', () => {
  const options: Record<string, any> = baseOptions();
  applyMemberGuard(options, { restricted: true, username: 'fulano' });

  assert.deepEqual(Object.keys(options.mcpServers), ['cloudcli-browser']);
  assert.ok(options.disallowedTools.includes('Bash(rm:*)'));
  for (const rule of MEMBER_DISALLOWED_TOOLS) {
    assert.ok(options.disallowedTools.includes(rule), rule);
  }
  assert.equal(options.systemPrompt.preset, 'claude_code');
  assert.match(options.systemPrompt.append, /"fulano"/);
  assert.match(options.systemPrompt.append, /NÃO é o Savio/);
});

test('applyMemberGuard works when no MCP servers are configured', () => {
  const options: Record<string, any> = { systemPrompt: { type: 'preset', preset: 'claude_code' } };
  applyMemberGuard(options, { restricted: true, username: null });
  assert.equal(options.mcpServers, undefined);
  assert.match(options.systemPrompt.append, /um funcionário/);
});
