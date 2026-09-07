import assert from 'node:assert/strict';
import test from 'node:test';

import { providerUsageLimitsService } from '@/modules/providers/services/provider-usage-limits.service.js';

const window = (remainingPercent: number) => ({
  id: 'current' as const,
  label: 'Janela atual',
  usedPercent: 100 - remainingPercent,
  remainingPercent,
  resetsAt: null,
  windowMinutes: 300,
});

test('a refused refresh keeps serving the last good reading', async () => {
  providerUsageLimitsService.resetCache();
  let calls = 0;

  const readWindows = async () => {
    calls += 1;
    if (calls === 1) {
      return [window(70)];
    }
    // The real endpoint answers HTTP 429 routinely once a few tabs poll it.
    throw new Error('Claude usage endpoint returned HTTP 429');
  };

  const first = await providerUsageLimitsService.getUsageLimits('claude', 1, readWindows);
  assert.equal(first.available, true);
  assert.equal(first.windows[0].remainingPercent, 70);
  assert.equal(first.stale ?? false, false);

  // Cached: this one does not reach the provider at all.
  const cached = await providerUsageLimitsService.getUsageLimits('claude', 1, readWindows);
  assert.equal(cached.available, true);
  assert.equal(calls, 1);

  // Force the refresh that fails, and confirm the bar still has numbers.
  providerUsageLimitsService.expireCacheForTests('claude', 1);
  const afterFailure = await providerUsageLimitsService.getUsageLimits('claude', 1, readWindows);
  assert.equal(calls, 2);
  assert.equal(afterFailure.available, true, 'a failed refresh must not blank the bar');
  assert.equal(afterFailure.windows[0].remainingPercent, 70);
  assert.equal(afterFailure.stale, true, 'the reading is flagged as a cached one');
});

test('with nothing cached, a failure reports unavailable instead of inventing data', async () => {
  providerUsageLimitsService.resetCache();

  const result = await providerUsageLimitsService.getUsageLimits('claude', 1, async () => {
    throw new Error('offline');
  });

  assert.equal(result.available, false);
  assert.deepEqual(result.windows, []);
});

test('concurrent callers share one provider round-trip', async () => {
  providerUsageLimitsService.resetCache();
  let calls = 0;

  const readWindows = async () => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 20));
    return [window(55)];
  };

  const results = await Promise.all(
    [1, 2, 3, 4].map(() => providerUsageLimitsService.getUsageLimits('claude', 1, readWindows)),
  );

  // Four open tabs must cost one upstream call, not four — polling in lockstep
  // is exactly what earned the rate limit in the first place.
  assert.equal(calls, 1);
  assert.equal(results.filter((result) => result.available).length, 4);
});

test('each account is cached separately', async () => {
  providerUsageLimitsService.resetCache();
  const readWindows = async (_provider: 'claude' | 'codex', userId: string | number | null) =>
    [window(userId === 1 ? 90 : 10)];

  const first = await providerUsageLimitsService.getUsageLimits('claude', 1, readWindows);
  const second = await providerUsageLimitsService.getUsageLimits('claude', 2, readWindows);

  assert.equal(first.windows[0].remainingPercent, 90);
  assert.equal(second.windows[0].remainingPercent, 10, 'one user must not read another user quota');
});

test('an account with no quota to report does not evict a good reading', async () => {
  providerUsageLimitsService.resetCache();
  let calls = 0;

  const readWindows = async () => {
    calls += 1;
    return calls === 1 ? [window(40)] : [];
  };

  await providerUsageLimitsService.getUsageLimits('claude', 1, readWindows);
  providerUsageLimitsService.expireCacheForTests('claude', 1);

  const empty = await providerUsageLimitsService.getUsageLimits('claude', 1, readWindows);
  assert.equal(empty.available, false);

  // The empty answer is honest, but it must not have overwritten the cache.
  providerUsageLimitsService.expireCacheForTests('claude', 1);
  const afterFailure = await providerUsageLimitsService.getUsageLimits('claude', 1, async () => {
    throw new Error('429');
  });
  assert.equal(afterFailure.windows[0].remainingPercent, 40);
});
