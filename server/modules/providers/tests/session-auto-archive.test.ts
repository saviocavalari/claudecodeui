import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveAutoArchiveIdleDays } from '@/modules/providers/services/session-auto-archive.service.js';

test('auto-archive waits five days unless SESSION_AUTO_ARCHIVE_DAYS sets a valid count', () => {
  assert.equal(resolveAutoArchiveIdleDays(''), 5);
  assert.equal(resolveAutoArchiveIdleDays('10'), 10);
  assert.equal(resolveAutoArchiveIdleDays('0'), 0);
  assert.equal(resolveAutoArchiveIdleDays('abc'), 5);
  assert.equal(resolveAutoArchiveIdleDays('-2'), 5);
  assert.equal(resolveAutoArchiveIdleDays('1.5'), 5);
});
