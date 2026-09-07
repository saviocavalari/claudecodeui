import assert from 'node:assert/strict';
import test from 'node:test';

import {
  extractTokenBudget,
  resolveContextWindow,
} from '@/modules/providers/list/claude/claude-runtime.provider.js';

const withEnv = (value, run) => {
  const previous = process.env.CONTEXT_WINDOW;
  if (value === undefined) {
    delete process.env.CONTEXT_WINDOW;
  } else {
    process.env.CONTEXT_WINDOW = value;
  }
  try {
    run();
  } finally {
    if (previous === undefined) {
      delete process.env.CONTEXT_WINDOW;
    } else {
      process.env.CONTEXT_WINDOW = previous;
    }
  }
};

test('context window follows the model instead of a fixed value', () => {
  withEnv(undefined, () => {
    assert.equal(resolveContextWindow('opus'), 200_000);
    assert.equal(resolveContextWindow('sonnet'), 200_000);
    assert.equal(resolveContextWindow(undefined), 200_000);

    // The long-context variants carry the suffix in their model id.
    assert.equal(resolveContextWindow('opus[1m]'), 1_000_000);
    assert.equal(resolveContextWindow('sonnet[1m]'), 1_000_000);
    assert.equal(resolveContextWindow('claude-opus-5[1M]'), 1_000_000);
  });
});

test('an explicit CONTEXT_WINDOW still overrides the model default', () => {
  withEnv('50000', () => {
    assert.equal(resolveContextWindow('opus'), 50_000);
    assert.equal(resolveContextWindow('opus[1m]'), 50_000);
  });

  // A junk value must not silently produce a zero-width window, which would
  // read as "100% used" on the meter from the very first turn.
  withEnv('not-a-number', () => {
    assert.equal(resolveContextWindow('opus'), 200_000);
  });
  withEnv('0', () => {
    assert.equal(resolveContextWindow('opus'), 200_000);
  });
});

test('token budget counts cache reads against the window', () => {
  withEnv(undefined, () => {
    const budget = extractTokenBudget(
      {
        type: 'assistant',
        message: {
          usage: {
            input_tokens: 1_000,
            cache_read_input_tokens: 4_000,
            cache_creation_input_tokens: 500,
            output_tokens: 250,
          },
        },
      },
      'opus[1m]',
    );

    // Cached input still occupies the window, so it belongs in the total.
    assert.equal(budget.inputTokens, 5_500);
    assert.equal(budget.outputTokens, 250);
    assert.equal(budget.used, 5_750);
    assert.equal(budget.total, 1_000_000);
  });
});

test('token budget falls back to the model on the message when none is passed', () => {
  withEnv(undefined, () => {
    const budget = extractTokenBudget({
      type: 'assistant',
      message: {
        model: 'sonnet[1m]',
        usage: { input_tokens: 10, output_tokens: 5 },
      },
    });

    assert.equal(budget.total, 1_000_000);
  });
});
