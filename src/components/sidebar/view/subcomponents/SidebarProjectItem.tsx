import { useState } from 'react';
import { Check, ChevronDown, ChevronRight, Edit3, FolderInput, SmilePlus, Star, Trash2, X } from 'lucide-react';
import type { TFunction } from 'i18next';

import { Button } from '../../../../shared/view/ui';
import { cn } from '../../../../lib/utils';
import { useAuth } from '../../../auth/context/AuthContext';
import type { Project, ProjectSession, LLMProvider } from '../../../../types/app';
import type { SessionActivityMap } from '../../../../hooks/useSessionProtection';
import type { MCPServerStatus, SessionWithProvider } from '../../types/types';
import { getTaskIndicatorStatus } from '../../utils/utils';

import TaskIndicator from './TaskIndicator';
import SidebarProjectSessions from './SidebarProjectSessions';
import ProjectEmojiModal from './ProjectEmojiModal';
import ProjectFolderModal from './ProjectFolderModal';

type SidebarProjectItemProps = {
  project: Project;
  selectedProject: Project | null;
  selectedSession: ProjectSession | null;
  isExpanded: boolean;
  isDeleting: boolean;
  isStarred: boolean;
  editingProject: string | null;
  editingName: string;
  sessions: SessionWithProvider[];
  initialSessionsLoaded: boolean;
  isLoadingMoreSessions: boolean;
  currentTime: Date;
  editingSession: string | null;
  editingSessionName: string;
  tasksEnabled: boolean;
  mcpServerStatus: MCPServerStatus;
  onEditingNameChange: (name: string) => void;
  onToggleProject: (projectName: string) => void;
  onProjectSelect: (project: Project) => void;
  onToggleStarProject: (projectName: string) => void;
  onStartEditingProject: (project: Project) => void;
  onCancelEditingProject: () => void;
  onSaveProjectName: (projectName: string) => void;
  onSaveProjectEmoji: (projectId: string, emoji: string | null) => void;
  onSaveProjectFolder: (projectId: string, folder: string | null) => void;
  existingFolders: string[];
  onDeleteProject: (project: Project) => void;
  onSessionSelect: (session: SessionWithProvider, projectName: string) => void;
  onDeleteSession: (
    projectName: string,
    sessionId: string,
    sessionTitle: string,
    provider: LLMProvider,
  ) => void;
  onLoadMoreSessions: (projectId: string) => void;
  activeSessions: SessionActivityMap;
  attentionSessionIds: ReadonlySet<string>;
  onNewSession: (project: Project) => void;
  onEditingSessionNameChange: (value: string) => void;
  onStartEditingSession: (sessionId: string, initialName: string) => void;
  onCancelEditingSession: () => void;
  onSaveEditingSession: (projectName: string, sessionId: string, summary: string, provider: LLMProvider) => void;
  t: TFunction;
};

const getSessionCountDisplay = (project: Project, sessions: SessionWithProvider[]): string => {
  const total = Number(project.sessionMeta?.total ?? sessions.length);
  return String(total);
};

export default function SidebarProjectItem({
  project,
  selectedProject,
  selectedSession,
  isExpanded,
  isDeleting,
  isStarred,
  editingProject,
  editingName,
  sessions,
  initialSessionsLoaded,
  isLoadingMoreSessions,
  currentTime,
  editingSession,
  editingSessionName,
  tasksEnabled,
  mcpServerStatus,
  onEditingNameChange,
  onToggleProject,
  onProjectSelect,
  onToggleStarProject,
  onStartEditingProject,
  onCancelEditingProject,
  onSaveProjectName,
  onSaveProjectEmoji,
  onSaveProjectFolder,
  existingFolders,
  onDeleteProject,
  onSessionSelect,
  onDeleteSession,
  onLoadMoreSessions,
  activeSessions,
  attentionSessionIds,
  onNewSession,
  onEditingSessionNameChange,
  onStartEditingSession,
  onCancelEditingSession,
  onSaveEditingSession,
  t,
}: SidebarProjectItemProps) {
  // Project identity is tracked by the DB-assigned `projectId` everywhere
  // after the projectName → projectId migration.
  const isSelected = selectedProject?.projectId === project.projectId;
  const isEditing = editingProject === project.projectId;
  // Project management (rename/delete/emoji/folder/star) is admin-only; members
  // only open and use the projects granted to them.
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [showEmojiModal, setShowEmojiModal] = useState(false);
  const [showFolderModal, setShowFolderModal] = useState(false);
  const projectEmoji = typeof project.emoji === 'string' && project.emoji.length > 0 ? project.emoji : null;
  const projectFolder = typeof project.folder === 'string' && project.folder.length > 0 ? project.folder : null;
  const totalSessionCount = Number(project.sessionMeta?.total ?? sessions.length);
  const sessionCountDisplay = getSessionCountDisplay(project, sessions);
  const sessionCountLabel = `${sessionCountDisplay} session${totalSessionCount === 1 ? '' : 's'}`;
  const taskStatus = getTaskIndicatorStatus(project, mcpServerStatus);

  const toggleProject = () => onToggleProject(project.projectId);
  const toggleStarProject = () => onToggleStarProject(project.projectId);

  const saveProjectName = () => {
    onSaveProjectName(project.projectId);
  };

  const selectAndToggleProject = () => {
    if (selectedProject?.projectId !== project.projectId) {
      onProjectSelect(project);
    }

    toggleProject();
  };

  return (
    <div className={cn('md:space-y-1', isDeleting && 'opacity-50 pointer-events-none')}>
      <div className="md:group group">
        <div className="md:hidden">
          <div
            className={cn(
              'p-3 mx-3 my-1 rounded-lg bg-card border border-border/50 active:scale-[0.98] transition-all duration-150',
              isSelected && 'bg-primary/5 border-primary/20',
              isStarred &&
                !isSelected &&
                'bg-yellow-50/50 dark:bg-yellow-900/5 border-yellow-200/30 dark:border-yellow-800/30',
            )}
            onClick={toggleProject}
          >
            <div className="flex items-center justify-between">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <button
                  className={cn(
                    'w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-150 border',
                    isAdmin && 'active:scale-90',
                    isStarred
                      ? 'bg-yellow-500/10 dark:bg-yellow-900/30 border-yellow-200 dark:border-yellow-800'
                      : 'bg-gray-500/10 dark:bg-gray-900/30 border-gray-200 dark:border-gray-800',
                  )}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (isAdmin) toggleStarProject();
                  }}
                  title={
                    isAdmin
                      ? isStarred
                        ? t('tooltips.removeFromFavorites')
                        : t('tooltips.addToFavorites')
                      : undefined
                  }
                >
                  <Star
                    className={cn(
                      'w-4 h-4 transition-colors',
                      isStarred
                        ? 'text-yellow-600 dark:text-yellow-400 fill-current'
                        : 'text-gray-600 dark:text-gray-400',
                    )}
                  />
                </button>

                <div className="min-w-0 flex-1">
                  {isEditing ? (
                    <input
                      type="text"
                      value={editingName}
                      onChange={(event) => onEditingNameChange(event.target.value)}
                      className="w-full rounded-lg border-2 border-primary/40 bg-background px-3 py-2 text-sm text-foreground shadow-sm transition-all duration-200 focus:border-primary focus:shadow-md focus:outline-none"
                      placeholder={t('projects.projectNamePlaceholder')}
                      autoFocus
                      autoComplete="off"
                      onClick={(event) => event.stopPropagation()}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          saveProjectName();
                        }

                        if (event.key === 'Escape') {
                          onCancelEditingProject();
                        }
                      }}
                      style={{
                        fontSize: '16px',
                        WebkitAppearance: 'none',
                        borderRadius: '8px',
                      }}
                    />
                  ) : (
                    <>
                      <div className="flex min-w-0 flex-1 items-center justify-between">
                        <h3 className="truncate text-sm font-normal text-foreground">
                          {projectEmoji && <span className="mr-1.5">{projectEmoji}</span>}
                          {project.displayName}
                        </h3>
                        {tasksEnabled && (
                          <TaskIndicator
                            status={taskStatus}
                            size="xs"
                            className="ml-2 hidden flex-shrink-0 md:inline-flex"
                          />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{sessionCountLabel}</p>
                    </>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1">
                {isEditing ? (
                  <>
                    <button
                      className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-500 shadow-sm transition-all duration-150 active:scale-90 active:shadow-none dark:bg-green-600"
                      onClick={(event) => {
                        event.stopPropagation();
                        saveProjectName();
                      }}
                    >
                      <Check className="h-4 w-4 text-white" />
                    </button>
                    <button
                      className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-500 shadow-sm transition-all duration-150 active:scale-90 active:shadow-none dark:bg-gray-600"
                      onClick={(event) => {
                        event.stopPropagation();
                        onCancelEditingProject();
                      }}
                    >
                      <X className="h-4 w-4 text-white" />
                    </button>
                  </>
                ) : (
                  <>
                    {isAdmin && (
                      <>
                        <button
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-muted/40 active:scale-90"
                          onClick={(event) => {
                            event.stopPropagation();
                            setShowEmojiModal(true);
                          }}
                          title={t('tooltips.setEmoji')}
                        >
                          <SmilePlus className="h-4 w-4 text-muted-foreground" />
                        </button>

                        <button
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-muted/40 active:scale-90"
                          onClick={(event) => {
                            event.stopPropagation();
                            setShowFolderModal(true);
                          }}
                          title={t('tooltips.setFolder')}
                        >
                          <FolderInput className="h-4 w-4 text-muted-foreground" />
                        </button>

                        <button
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 bg-red-500/10 active:scale-90 dark:border-red-800 dark:bg-red-900/30"
                          onClick={(event) => {
                            event.stopPropagation();
                            onDeleteProject(project);
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-red-600 dark:text-red-400" />
                        </button>

                        <button
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 active:scale-90 dark:border-primary/30 dark:bg-primary/20"
                          onClick={(event) => {
                            event.stopPropagation();
                            onStartEditingProject(project);
                          }}
                        >
                          <Edit3 className="h-4 w-4 text-primary" />
                        </button>
                      </>
                    )}

                    <div className="flex h-6 w-6 items-center justify-center rounded-md bg-muted/30">
                      {isExpanded ? (
                        <ChevronDown className="h-3 w-3 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-3 w-3 text-muted-foreground" />
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        <Button
          variant="ghost"
          className={cn(
            'relative hidden h-auto w-full items-center p-2 font-normal md:flex hover:bg-accent/50',
            isSelected && 'bg-accent text-accent-foreground',
            isStarred &&
              !isSelected &&
              'bg-yellow-50/50 dark:bg-yellow-900/10 hover:bg-yellow-100/50 dark:hover:bg-yellow-900/20',
          )}
          onClick={selectAndToggleProject}
        >
          {/* Compact single row; actions overlay the right side only on hover. */}
          <div className="flex w-full items-center gap-3">
            <div
              className={cn(
                'w-6 h-6 flex flex-shrink-0 items-center justify-center rounded transition-all duration-200',
                isAdmin && 'cursor-pointer',
                isStarred
                  ? isAdmin && 'hover:bg-yellow-50 dark:hover:bg-yellow-900/20'
                  : cn('opacity-40', isAdmin && 'hover:opacity-100 hover:bg-accent'),
              )}
              onClick={(event) => {
                event.stopPropagation();
                if (isAdmin) toggleStarProject();
              }}
              title={
                isAdmin
                  ? isStarred
                    ? t('tooltips.removeFromFavorites')
                    : t('tooltips.addToFavorites')
                  : undefined
              }
            >
              <Star
                className={cn(
                  'w-3 h-3 transition-colors',
                  isStarred
                    ? 'text-yellow-600 dark:text-yellow-400 fill-current'
                    : 'text-muted-foreground',
                )}
              />
            </div>

            {isEditing ? (
              <input
                type="text"
                value={editingName}
                onChange={(event) => onEditingNameChange(event.target.value)}
                className="min-w-0 flex-1 rounded border border-border bg-background px-2 py-1 text-sm text-foreground focus:ring-2 focus:ring-primary/20"
                placeholder={t('projects.projectNamePlaceholder')}
                autoFocus
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    saveProjectName();
                  }
                  if (event.key === 'Escape') {
                    onCancelEditingProject();
                  }
                }}
              />
            ) : (
              <div
                className="min-w-0 flex-1 truncate text-left text-sm font-medium text-foreground"
                title={project.displayName}
              >
                {projectEmoji && <span className="mr-1.5">{projectEmoji}</span>}
                {project.displayName}
              </div>
            )}

            {!isEditing && (
              <span className="flex-shrink-0 text-xs text-muted-foreground">
                {sessionCountDisplay}
              </span>
            )}

            {isEditing ? (
              <div className="flex flex-shrink-0 items-center gap-1">
                <div
                  className="flex h-6 w-6 cursor-pointer items-center justify-center rounded text-green-600 transition-colors hover:bg-green-50 hover:text-green-700 dark:hover:bg-green-900/20"
                  onClick={(event) => {
                    event.stopPropagation();
                    saveProjectName();
                  }}
                >
                  <Check className="h-3 w-3" />
                </div>
                <div
                  className="flex h-6 w-6 cursor-pointer items-center justify-center rounded text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-700 dark:hover:bg-gray-800"
                  onClick={(event) => {
                    event.stopPropagation();
                    onCancelEditingProject();
                  }}
                >
                  <X className="h-3 w-3" />
                </div>
              </div>
            ) : (
              <div className="flex-shrink-0">
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-foreground" />
                )}
              </div>
            )}
          </div>

          {!isEditing && isAdmin && (
            <div className="absolute right-8 top-1/2 flex -translate-y-1/2 items-center gap-1 rounded-md bg-background/95 px-1 opacity-0 shadow-sm transition-opacity group-hover:opacity-100">
                <div
                  className="touch:opacity-100 flex h-6 w-6 cursor-pointer items-center justify-center rounded opacity-0 transition-all duration-200 hover:bg-accent group-hover:opacity-100"
                  onClick={(event) => {
                    event.stopPropagation();
                    setShowEmojiModal(true);
                  }}
                  title={t('tooltips.setEmoji')}
                >
                  <SmilePlus className="h-3 w-3" />
                </div>
                <div
                  className="touch:opacity-100 flex h-6 w-6 cursor-pointer items-center justify-center rounded opacity-0 transition-all duration-200 hover:bg-accent group-hover:opacity-100"
                  onClick={(event) => {
                    event.stopPropagation();
                    setShowFolderModal(true);
                  }}
                  title={t('tooltips.setFolder')}
                >
                  <FolderInput className="h-3 w-3" />
                </div>
                <div
                  className="touch:opacity-100 flex h-6 w-6 cursor-pointer items-center justify-center rounded opacity-0 transition-all duration-200 hover:bg-accent group-hover:opacity-100"
                  onClick={(event) => {
                    event.stopPropagation();
                    onStartEditingProject(project);
                  }}
                  title={t('tooltips.renameProject')}
                >
                  <Edit3 className="h-3 w-3" />
                </div>
                <div
                  className="touch:opacity-100 flex h-6 w-6 cursor-pointer items-center justify-center rounded opacity-0 transition-all duration-200 hover:bg-red-50 group-hover:opacity-100 dark:hover:bg-red-900/20"
                  onClick={(event) => {
                    event.stopPropagation();
                    onDeleteProject(project);
                  }}
                  title={t('tooltips.deleteProject')}
                >
                  <Trash2 className="h-3 w-3 text-red-600 dark:text-red-400" />
                </div>
            </div>
          )}
        </Button>
      </div>

      <SidebarProjectSessions
        project={project}
        isExpanded={isExpanded}
        sessions={sessions}
        selectedSession={selectedSession}
        initialSessionsLoaded={initialSessionsLoaded}
        hasMoreSessions={Boolean(project.sessionMeta?.hasMore)}
        isLoadingMoreSessions={isLoadingMoreSessions}
        activeSessions={activeSessions}
        attentionSessionIds={attentionSessionIds}
        currentTime={currentTime}
        editingSession={editingSession}
        editingSessionName={editingSessionName}
        onEditingSessionNameChange={onEditingSessionNameChange}
        onStartEditingSession={onStartEditingSession}
        onCancelEditingSession={onCancelEditingSession}
        onSaveEditingSession={onSaveEditingSession}
        onProjectSelect={onProjectSelect}
        onSessionSelect={onSessionSelect}
        onDeleteSession={onDeleteSession}
        onLoadMoreSessions={onLoadMoreSessions}
        onNewSession={onNewSession}
        t={t}
      />

      {showEmojiModal && (
        <ProjectEmojiModal
          projectDisplayName={project.displayName}
          currentEmoji={projectEmoji}
          onClose={() => setShowEmojiModal(false)}
          onSelect={(emoji) => onSaveProjectEmoji(project.projectId, emoji)}
          t={t}
        />
      )}

      {showFolderModal && (
        <ProjectFolderModal
          projectDisplayName={project.displayName}
          currentFolder={projectFolder}
          existingFolders={existingFolders}
          onClose={() => setShowFolderModal(false)}
          onSelect={(folder) => onSaveProjectFolder(project.projectId, folder)}
          t={t}
        />
      )}
    </div>
  );
}
