import type { BrowserManualAction, BrowserSessionUser } from '@/shared/types.js';

const PERSONAL_PROFILE_PREFIX = 'manual-';

/** Profile behind the session a user opens from the Browser panel; it keeps their logins between sessions. */
export function personalProfileName(userId: string): string {
  return `${PERSONAL_PROFILE_PREFIX}${userId}`;
}

/**
 * Used by the browser service to hide and lock personal sessions, which hold
 * someone's logins. Sessions opened by agents stay shared with every user.
 */
export function canUseBrowserSession(profileName: string | null, user: BrowserSessionUser): boolean {
  if (user.isAdmin || !profileName?.startsWith(PERSONAL_PROFILE_PREFIX)) return true;
  return profileName === personalProfileName(user.id);
}

/** Used by browser routes to reject malformed input before accessing a browser; tests exercise the transport boundary. */
export function parseBrowserManualAction(value: unknown): BrowserManualAction {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid browser action.');
  const input = value as Record<string, unknown>;
  const number = (v: unknown, min: number, max: number): number => {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) throw new Error('Invalid coordinate.');
    return v;
  };
  const string = (v: unknown, max: number): string => {
    if (typeof v !== 'string' || v.length > max) throw new Error('Invalid text.');
    return v;
  };
  switch (input.action) {
    case 'control':
      if (typeof input.enabled !== 'boolean') throw new Error('Invalid control state.');
      return { action: 'control', enabled: input.enabled };
    case 'snapshot': case 'back': case 'forward': case 'reload': return { action: input.action };
    case 'navigate': {
      const url = string(input.url, 8192).trim();
      const parsed = new URL(/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(url) ? url : `https://${url}`);
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Only HTTP(S) URLs are allowed.');
      return { action: 'navigate', url: parsed.toString() };
    }
    case 'text': return { action: 'text', text: string(input.text, 10000) };
    case 'key': {
      const key = string(input.key, 80);
      if (!/^(?:(?:Control|Meta|Alt|Shift)\+)*(?:Enter|Tab|Backspace|Delete|Escape|ArrowLeft|ArrowRight|ArrowUp|ArrowDown|Home|End|PageUp|PageDown|Space|[a-zA-Z0-9])$/.test(key)) throw new Error('Unsupported key.');
      return { action: 'key', key };
    }
    case 'pointer':
      if (!Array.isArray(input.points) || input.points.length < 1 || input.points.length > 200) throw new Error('Invalid pointer path.');
      return { action: 'pointer', points: input.points.map(point => {
        if (!point || typeof point !== 'object') throw new Error('Invalid point.');
        return { x: number(point.x, 0, 16384), y: number(point.y, 0, 16384) };
      }) };
    case 'scroll': return { action: 'scroll', x: number(input.x, 0, 16384), y: number(input.y, 0, 16384), deltaX: number(input.deltaX, -4000, 4000), deltaY: number(input.deltaY, -4000, 4000) };
    case 'tab': {
      const index = number(input.index, 0, 100);
      if (!Number.isInteger(index)) throw new Error('Invalid tab index.');
      return { action: 'tab', index };
    }
    default: throw new Error('Unknown browser action.');
  }
}
