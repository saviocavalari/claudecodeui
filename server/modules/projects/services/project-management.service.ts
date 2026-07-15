import fs from 'node:fs/promises';
import path from 'node:path';

import { projectsDb } from '@/modules/database/index.js';
import type {
  CreateProjectPathResult,
  ProjectRepositoryRow,
  WorkspacePathValidationResult,
} from '@/shared/types.js';
import { AppError, normalizeProjectPath, validateWorkspacePath } from '@/shared/utils.js';

type CreateProjectInput = {
  projectPath: string;
  customName?: string | null;
};

type CreateProjectDependencies = {
  validatePath: (projectPath: string) => Promise<WorkspacePathValidationResult>;
  ensureWorkspaceDirectory: (projectPath: string) => Promise<void>;
  persistProjectPath: (projectPath: string, customName: string | null) => CreateProjectPathResult;
  getProjectByPath: (projectPath: string) => ProjectRepositoryRow | null;
};

type ProjectApiView = {
  projectId: string;
  path: string;
  fullPath: string;
  displayName: string;
  customName: string | null;
  isArchived: boolean;
  isStarred: boolean;
  emoji: string | null;
  folder: string | null;
  sessions: [];
  sessionMeta: {
    hasMore: false;
    total: 0;
  };
};

type CreateProjectServiceResult = {
  outcome: 'created' | 'reactivated_archived';
  project: ProjectApiView;
};

const defaultDependencies: CreateProjectDependencies = {
  validatePath: validateWorkspacePath,
  ensureWorkspaceDirectory: async (projectPath: string): Promise<void> => {
    await fs.mkdir(projectPath, { recursive: true });
    const directoryStats = await fs.stat(projectPath);
    if (!directoryStats.isDirectory()) {
      throw new AppError('Path exists but is not a directory', {
        code: 'PROJECT_PATH_NOT_DIRECTORY',
        statusCode: 400,
      });
    }
  },
  persistProjectPath: (projectPath: string, customName: string | null): CreateProjectPathResult =>
    projectsDb.createProjectPath(projectPath, customName),
  getProjectByPath: (projectPath: string): ProjectRepositoryRow | null =>
    projectsDb.getProjectPath(projectPath),
};

function resolveDisplayName(customName: string | null | undefined, projectPath: string): string {
  const trimmedCustomName = typeof customName === 'string' ? customName.trim() : '';
  if (trimmedCustomName.length > 0) {
    return trimmedCustomName;
  }

  return path.basename(projectPath) || projectPath;
}

function mapProjectRowToApiView(projectRow: ProjectRepositoryRow): ProjectApiView {
  return {
    projectId: projectRow.project_id,
    path: projectRow.project_path,
    fullPath: projectRow.project_path,
    displayName: resolveDisplayName(projectRow.custom_project_name, projectRow.project_path),
    customName: projectRow.custom_project_name,
    isArchived: Boolean(projectRow.isArchived),
    isStarred: Boolean(projectRow.isStarred),
    emoji: projectRow.emoji ?? null,
    folder: projectRow.folder ?? null,
    sessions: [],
    sessionMeta: {
      hasMore: false,
      total: 0,
    },
  };
}

export async function createProject(
  input: CreateProjectInput,
  dependencies: CreateProjectDependencies = defaultDependencies,
): Promise<CreateProjectServiceResult> {
  const normalizedPath = normalizeProjectPath(input.projectPath || '');
  if (!normalizedPath) {
    throw new AppError('path is required', {
      code: 'PROJECT_PATH_REQUIRED',
      statusCode: 400,
    });
  }

  const pathValidation = await dependencies.validatePath(normalizedPath);
  if (!pathValidation.valid || !pathValidation.resolvedPath) {
    throw new AppError('Invalid project path', {
      code: 'INVALID_PROJECT_PATH',
      statusCode: 400,
      details: pathValidation.error ?? 'Path validation failed',
    });
  }

  const resolvedProjectPath = normalizeProjectPath(pathValidation.resolvedPath);
  await dependencies.ensureWorkspaceDirectory(resolvedProjectPath);

  const normalizedCustomName = resolveDisplayName(input.customName ?? null, resolvedProjectPath);
  const persistedProject = dependencies.persistProjectPath(resolvedProjectPath, normalizedCustomName);

  if (persistedProject.outcome === 'active_conflict') {
    throw new AppError('Project path already exists and is active', {
      code: 'PROJECT_ALREADY_EXISTS',
      statusCode: 409,
      details: `Project path already exists: ${resolvedProjectPath}`,
    });
  }

  const projectRow = persistedProject.project ?? dependencies.getProjectByPath(resolvedProjectPath);
  if (!projectRow) {
    throw new AppError('Failed to resolve project after creation', {
      code: 'PROJECT_CREATE_FAILED',
      statusCode: 500,
    });
  }

  // Archived rows intentionally remain archived when reused, as requested.
  return {
    outcome: persistedProject.outcome,
    project: mapProjectRowToApiView(projectRow),
  };
}

/**
 * Sets `projects.custom_project_name` for the given `projectId` (or clears it when empty).
 */
export function updateProjectDisplayName(projectId: string, newDisplayName: unknown): void {
  const trimmed = typeof newDisplayName === 'string' ? newDisplayName.trim() : '';
  projectsDb.updateCustomProjectNameById(projectId, trimmed.length > 0 ? trimmed : null);
}

const MAX_PROJECT_EMOJI_LENGTH = 16;
const MAX_PROJECT_FOLDER_LENGTH = 60;

/**
 * Sets `projects.emoji` for the given `projectId` (or clears it when empty).
 * The length cap accounts for multi-codepoint emoji (ZWJ sequences, skin tones).
 */
export function updateProjectEmoji(projectId: string, newEmoji: unknown): void {
  const trimmed = typeof newEmoji === 'string' ? newEmoji.trim() : '';
  if (trimmed.length > MAX_PROJECT_EMOJI_LENGTH) {
    throw new AppError('emoji is too long', {
      code: 'PROJECT_EMOJI_TOO_LONG',
      statusCode: 400,
    });
  }

  projectsDb.updateProjectEmojiById(projectId, trimmed.length > 0 ? trimmed : null);
}

/**
 * Sets `projects.folder` for the given `projectId` (or clears it when empty).
 * Folders are plain labels; the sidebar groups projects that share one.
 */
export function updateProjectFolder(projectId: string, newFolder: unknown): void {
  const trimmed = typeof newFolder === 'string' ? newFolder.trim() : '';
  if (trimmed.length > MAX_PROJECT_FOLDER_LENGTH) {
    throw new AppError('folder name is too long', {
      code: 'PROJECT_FOLDER_TOO_LONG',
      statusCode: 400,
    });
  }

  projectsDb.updateProjectFolderById(projectId, trimmed.length > 0 ? trimmed : null);
}
