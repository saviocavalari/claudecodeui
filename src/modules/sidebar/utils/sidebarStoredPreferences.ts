import type { ProjectSortOrder, SidebarSessionScope } from '@/shared/types';
import { readUserPreference } from '@/shared/userSettings';

export const readProjectSortOrder = (): ProjectSortOrder => (
  readUserPreference<ProjectSortOrder>('projectSortOrder', 'name') === 'date' ? 'date' : 'name'
);

const SESSION_SCOPE_STORAGE_KEY = 'sidebar-session-scope';

/**
 * Whose conversations the sidebar lists. Per browser, defaulting to "mine" so
 * a shared install opens on the logged-in user's own sessions.
 */
export const readSidebarSessionScope = (): SidebarSessionScope => {
  try {
    return localStorage.getItem(SESSION_SCOPE_STORAGE_KEY) === 'all' ? 'all' : 'mine';
  } catch {
    return 'mine';
  }
};

export const writeSidebarSessionScope = (scope: SidebarSessionScope) => {
  try {
    localStorage.setItem(SESSION_SCOPE_STORAGE_KEY, scope);
  } catch {
    // Keep UI responsive even if storage is unavailable.
  }
};

const LEGACY_STARRED_PROJECTS_STORAGE_KEY = 'starredProjects';

/**
 * Reads legacy project stars from localStorage (used only for one-time migration to backend).
 */
export const readLegacyStarredProjectIds = (): string[] => {
  try {
    const saved = localStorage.getItem(LEGACY_STARRED_PROJECTS_STORAGE_KEY);
    if (!saved) {
      return [];
    }

    const parsed = JSON.parse(saved) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((value) => String(value).trim())
      .filter((value) => value.length > 0);
  } catch {
    return [];
  }
};

/**
 * Clears the legacy localStorage stars key after migration to backend completes.
 */
export const clearLegacyStarredProjectIds = () => {
  try {
    localStorage.removeItem(LEGACY_STARRED_PROJECTS_STORAGE_KEY);
  } catch {
    // Keep UI responsive even if storage is unavailable.
  }
};
