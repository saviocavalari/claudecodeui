import { sessionsDb } from '@/modules/database/index.js';

/**
 * Days without activity after which a session leaves the active lists.
 *
 * Overridable with `SESSION_AUTO_ARCHIVE_DAYS`; `0` turns the sweep off.
 */
const DEFAULT_IDLE_DAYS = 5;

/**
 * How often idle sessions are looked for.
 *
 * An hour keeps a session from lingering much past its cutoff, and each pass
 * is a single UPDATE, so anything finer would buy nothing.
 */
const SWEEP_INTERVAL_MS = 60 * 60 * 1000;

let sweepTimer: ReturnType<typeof setInterval> | null = null;

export function resolveAutoArchiveIdleDays(rawValue = process.env.SESSION_AUTO_ARCHIVE_DAYS): number {
  if (rawValue === undefined || rawValue.trim() === '') {
    return DEFAULT_IDLE_DAYS;
  }

  const idleDays = Number(rawValue);
  return Number.isInteger(idleDays) && idleDays >= 0 ? idleDays : DEFAULT_IDLE_DAYS;
}

/**
 * Starts the hourly sweep that archives idle sessions.
 *
 * The first pass runs right away. The caller starts it after the sessions
 * watcher's initial sync, so that pass already sees the activity the sync
 * read from transcripts written while the server was down.
 */
export function initializeSessionAutoArchive(): void {
  if (sweepTimer) {
    return;
  }

  const idleDays = resolveAutoArchiveIdleDays();
  if (idleDays === 0) {
    console.log('[AutoArchive] Disabled by SESSION_AUTO_ARCHIVE_DAYS=0');
    return;
  }

  const sweep = () => {
    try {
      const archived = sessionsDb.archiveSessionsIdleFor(idleDays);
      if (archived > 0) {
        console.log(`[AutoArchive] Archived ${archived} session(s) idle for more than ${idleDays} days`);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[AutoArchive] Sweep failed', { error: message });
    }
  };

  sweepTimer = setInterval(sweep, SWEEP_INTERVAL_MS);
  // Never keep the process alive just for the sweep.
  sweepTimer.unref?.();

  sweep();
}

export function closeSessionAutoArchive(): void {
  if (sweepTimer) {
    clearInterval(sweepTimer);
    sweepTimer = null;
  }
}
