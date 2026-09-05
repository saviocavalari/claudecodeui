import assert from 'node:assert/strict';
import os from 'node:os';
import test from 'node:test';

import {
  buildClaudeModelsDefinition,
  buildClaudeQueryOptions,
  CLAUDE_PREDEFINED_MODELS,
} from '@/modules/providers/list/claude/claude-models.provider.js';

test('buildClaudeModelsDefinition maps SDK model info onto catalog options', () => {
  const definition = buildClaudeModelsDefinition([
    {
      value: 'default',
      displayName: 'Default (recommended)',
      description: 'Opus 5 with 1M context',
      supportsEffort: true,
      supportedEffortLevels: ['low', 'medium', 'high', 'xhigh', 'max'],
    },
    {
      value: 'haiku',
      displayName: 'Haiku',
      description: 'Fastest for quick answers',
    },
    {
      value: 'haiku',
      displayName: 'Haiku duplicate',
      description: 'Should be deduped',
    },
  ]);

  assert.equal(definition.DEFAULT, 'default');
  assert.deepEqual(definition.OPTIONS, [
    {
      value: 'default',
      label: 'Default (recommended)',
      description: 'Opus 5 with 1M context',
      effort: {
        default: 'high',
        values: [
          { value: 'low' },
          { value: 'medium' },
          { value: 'high' },
          { value: 'xhigh' },
          { value: 'max' },
        ],
      },
    },
    {
      value: 'haiku',
      label: 'Haiku',
      description: 'Fastest for quick answers',
      effort: undefined,
    },
  ]);
});

test('buildClaudeModelsDefinition falls back to the first value when default is absent', () => {
  const definition = buildClaudeModelsDefinition([
    { value: 'opus[1m]', displayName: 'Opus (1M context)', description: 'Opus 5 with 1M context' },
  ]);

  assert.equal(definition.DEFAULT, 'opus[1m]');
});

test('buildClaudeModelsDefinition returns the fallback catalog for an empty list', () => {
  assert.equal(buildClaudeModelsDefinition([]), CLAUDE_PREDEFINED_MODELS);
});

test('buildClaudeQueryOptions keeps the discovery probe out of real workspaces', () => {
  const options = buildClaudeQueryOptions();

  assert.equal(options.persistSession, false);
  assert.equal(options.maxTurns, 1);
  assert.equal(options.cwd, os.tmpdir());
  assert.equal(typeof options.pathToClaudeCodeExecutable, 'string');
  assert.ok(options.env);
});
