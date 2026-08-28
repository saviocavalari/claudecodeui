const COMPLETION_TITLE_INDICATOR = '[Done]';
const WORKING_TITLE_INDICATOR = '●';
const TITLE_INDICATOR_CLEAR_DELAY_MS = 2000;

let clearTimer: number | null = null;
let returnListenersAttached = false;
// Session ids with a run currently in flight. A prefix is only meaningful
// tab-wide, so it stays up as long as at least one session is working —
// otherwise finishing session A would wipe the indicator while session B
// (still running) silently loses its "still working" signal.
const workingSessionIds = new Set<string>();

const getIndicatorPrefix = () => `${COMPLETION_TITLE_INDICATOR} `;
const getWorkingPrefix = () => `${WORKING_TITLE_INDICATOR} `;

const stripIndicator = (title: string): string => {
  if (title.startsWith(getIndicatorPrefix())) {
    return title.slice(getIndicatorPrefix().length);
  }
  if (title.startsWith(getWorkingPrefix())) {
    return title.slice(getWorkingPrefix().length);
  }
  return title;
};

const pageIsActive = (): boolean => (
  document.visibilityState === 'visible' && document.hasFocus()
);

const removeReturnListeners = (): void => {
  if (!returnListenersAttached || typeof window === 'undefined') {
    return;
  }

  document.removeEventListener('visibilitychange', handleUserReturn);
  window.removeEventListener('focus', handleUserReturn, true);
  window.removeEventListener('click', handleUserReturn, true);
  returnListenersAttached = false;
};

const clearTitleIndicator = (): void => {
  if (clearTimer !== null) {
    window.clearTimeout(clearTimer);
    clearTimer = null;
  }

  removeReturnListeners();
  removePageInactiveListener();

  if (document.title.startsWith(getIndicatorPrefix())) {
    document.title = stripIndicator(document.title);
  }
};

const removePageInactiveListener = (): void => {
  document.removeEventListener('visibilitychange', handlePageInactive);
};

const scheduleClear = (): void => {
  if (clearTimer !== null) {
    window.clearTimeout(clearTimer);
  }

  clearTimer = window.setTimeout(() => {
    clearTitleIndicator();
  }, TITLE_INDICATOR_CLEAR_DELAY_MS);

  removePageInactiveListener();
  document.addEventListener('visibilitychange', handlePageInactive, { once: true });
};

function handleUserReturn(): void {
  if (!pageIsActive()) {
    return;
  }

  // Background completions keep the marker indefinitely. A tab click normally
  // surfaces as visibility/focus, while an in-page click is a useful fallback.
  scheduleClear();
}

function handlePageInactive(): void {
  if (document.visibilityState !== 'hidden') {
    return;
  }

  if (clearTimer !== null) {
    window.clearTimeout(clearTimer);
    clearTimer = null;
  }

  if (!returnListenersAttached) {
    document.addEventListener('visibilitychange', handleUserReturn);
    window.addEventListener('focus', handleUserReturn, true);
    window.addEventListener('click', handleUserReturn, true);
    returnListenersAttached = true;
  }
}

export const showCompletionTitleIndicator = (): void => {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return;
  }

  const baseTitle = stripIndicator(document.title || 'CloudCLI UI');
  document.title = `${getIndicatorPrefix()}${baseTitle}`;

  if (pageIsActive()) {
    scheduleClear();
    return;
  }

  if (clearTimer !== null) {
    window.clearTimeout(clearTimer);
    clearTimer = null;
  }

  if (!returnListenersAttached) {
    document.addEventListener('visibilitychange', handleUserReturn);
    window.addEventListener('focus', handleUserReturn, true);
    window.addEventListener('click', handleUserReturn, true);
    returnListenersAttached = true;
  }
};

/**
 * Marks one session as actively running. While any session is working, the
 * tab title carries a plain "still going" marker — unlike the completion
 * indicator, it needs no visibility tricks: it's just true or false, visible
 * whether or not the tab is focused, so a long background run never reads as
 * frozen.
 */
export const markSessionWorking = (sessionId: string | null | undefined): void => {
  if (typeof document === 'undefined' || !sessionId) {
    return;
  }

  const wasIdle = workingSessionIds.size === 0;
  workingSessionIds.add(sessionId);
  if (!wasIdle) {
    return;
  }

  if (clearTimer !== null) {
    window.clearTimeout(clearTimer);
    clearTimer = null;
  }
  removeReturnListeners();
  removePageInactiveListener();

  document.title = `${getWorkingPrefix()}${stripIndicator(document.title || 'CloudCLI UI')}`;
};

/**
 * Marks one session as settled (finished, failed, or aborted). Returns
 * whether every tracked session is now idle — callers use that to decide
 * whether it's safe to layer the completion indicator on top, instead of
 * stomping on another session's still-active "working" marker.
 */
export const markSessionSettled = (sessionId: string | null | undefined): boolean => {
  if (typeof document === 'undefined' || !sessionId) {
    return workingSessionIds.size === 0;
  }

  workingSessionIds.delete(sessionId);
  const isFullyIdle = workingSessionIds.size === 0;
  if (!isFullyIdle) {
    return false;
  }

  if (document.title.startsWith(getWorkingPrefix())) {
    document.title = stripIndicator(document.title);
  }
  return true;
};
