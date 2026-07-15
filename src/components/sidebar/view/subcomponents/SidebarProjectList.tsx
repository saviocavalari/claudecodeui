import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Folder, FolderOpen } from 'lucide-react';
import type { TFunction } from 'i18next';

import type { LoadingProgress, Project, ProjectSession, LLMProvider } from '../../../../types/app';
import type { SessionActivityMap } from '../../../../hooks/useSessionProtection';
import type { MCPServerStatus, SessionWithProvider } from '../../types/types';

import SidebarProjectItem from './SidebarProjectItem';
import SidebarProjectsState from './SidebarProjectsState';

const COLLAPSED_FOLDERS_STORAGE_KEY = 'sidebar-collapsed-folders';

const readCollapsedFolders = (): Set<string> => {
  try {
    const raw = localStorage.getItem(COLLAPSED_FOLDERS_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(
      Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : [],
    );
  } catch {
    return new Set();
  }
};

const getProjectFolder = (project: Project): string | null =>
  typeof project.folder === 'string' && project.folder.length > 0 ? project.folder : null;

export type SidebarProjectListProps = {
  projects: Project[];
  filteredProjects: Project[];
  selectedProject: Project | null;
  selectedSession: ProjectSession | null;
  isLoading: boolean;
  loadingProgress: LoadingProgress | null;
  expandedProjects: Set<string>;
  editingProject: string | null;
  editingName: string;
  initialSessionsLoaded: Set<string>;
  currentTime: Date;
  editingSession: string | null;
  editingSessionName: string;
  deletingProjects: Set<string>;
  tasksEnabled: boolean;
  mcpServerStatus: MCPServerStatus;
  getProjectSessions: (project: Project) => SessionWithProvider[];
  onLoadMoreSessions: (projectId: string) => void;
  loadingMoreProjects: Set<string>;
  activeSessions: SessionActivityMap;
  attentionSessionIds: ReadonlySet<string>;
  forceExpanded?: boolean;
  searchActive?: boolean;
  isProjectStarred: (projectName: string) => boolean;
  onEditingNameChange: (value: string) => void;
  onToggleProject: (projectName: string) => void;
  onProjectSelect: (project: Project) => void;
  onToggleStarProject: (projectName: string) => void;
  onStartEditingProject: (project: Project) => void;
  onCancelEditingProject: () => void;
  onSaveProjectName: (projectName: string) => void;
  onSaveProjectEmoji: (projectId: string, emoji: string | null) => void;
  onSaveProjectFolder: (projectId: string, folder: string | null) => void;
  onDeleteProject: (project: Project) => void;
  onSessionSelect: (session: SessionWithProvider, projectName: string) => void;
  onDeleteSession: (
    projectName: string,
    sessionId: string,
    sessionTitle: string,
    provider: LLMProvider,
  ) => void;
  onNewSession: (project: Project) => void;
  onEditingSessionNameChange: (value: string) => void;
  onStartEditingSession: (sessionId: string, initialName: string) => void;
  onCancelEditingSession: () => void;
  onSaveEditingSession: (projectName: string, sessionId: string, summary: string, provider: LLMProvider) => void;
  t: TFunction;
};

export default function SidebarProjectList({
  projects,
  filteredProjects,
  selectedProject,
  selectedSession,
  isLoading,
  loadingProgress,
  expandedProjects,
  editingProject,
  editingName,
  initialSessionsLoaded,
  currentTime,
  editingSession,
  editingSessionName,
  deletingProjects,
  tasksEnabled,
  mcpServerStatus,
  getProjectSessions,
  onLoadMoreSessions,
  loadingMoreProjects,
  activeSessions,
  attentionSessionIds,
  forceExpanded = false,
  searchActive = false,
  isProjectStarred,
  onEditingNameChange,
  onToggleProject,
  onProjectSelect,
  onToggleStarProject,
  onStartEditingProject,
  onCancelEditingProject,
  onSaveProjectName,
  onSaveProjectEmoji,
  onSaveProjectFolder,
  onDeleteProject,
  onSessionSelect,
  onDeleteSession,
  onNewSession,
  onEditingSessionNameChange,
  onStartEditingSession,
  onCancelEditingSession,
  onSaveEditingSession,
  t,
}: SidebarProjectListProps) {
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(readCollapsedFolders);

  const toggleFolder = (folder: string) => {
    setCollapsedFolders((previous) => {
      const next = new Set(previous);
      if (next.has(folder)) {
        next.delete(folder);
      } else {
        next.add(folder);
      }

      try {
        localStorage.setItem(COLLAPSED_FOLDERS_STORAGE_KEY, JSON.stringify([...next]));
      } catch {
        // Persisting the collapse state is best-effort only.
      }

      return next;
    });
  };

  // Folder names come from every known project (not just the filtered list) so
  // the "move to folder" modal always offers the full set.
  const existingFolders = useMemo(() => {
    const names = new Set<string>();
    projects.forEach((project) => {
      const folder = getProjectFolder(project);
      if (folder) {
        names.add(folder);
      }
    });
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [projects]);

  const { folderGroups, ungroupedProjects } = useMemo(() => {
    const groups = new Map<string, Project[]>();
    const ungrouped: Project[] = [];

    filteredProjects.forEach((project) => {
      const folder = getProjectFolder(project);
      if (!folder) {
        ungrouped.push(project);
        return;
      }

      const group = groups.get(folder);
      if (group) {
        group.push(project);
      } else {
        groups.set(folder, [project]);
      }
    });

    return {
      folderGroups: [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0])),
      ungroupedProjects: ungrouped,
    };
  }, [filteredProjects]);

  const state = (
    <SidebarProjectsState
      isLoading={isLoading}
      loadingProgress={loadingProgress}
      projectsCount={projects.length}
      filteredProjectsCount={filteredProjects.length}
      t={t}
    />
  );

  useEffect(() => {
    let baseTitle = 'CloudCLI UI';
    const displayName = selectedProject?.displayName?.trim();
    if (displayName) {
      baseTitle = `${displayName} - ${baseTitle}`;
    }
    document.title = baseTitle;
  }, [selectedProject]);

  const showProjects = !isLoading && projects.length > 0 && filteredProjects.length > 0;

  const renderProject = (project: Project) => (
    // React key + per-project state lookups all use the DB `projectId`
    // so they remain stable across renames and session changes.
    <SidebarProjectItem
      key={project.projectId}
      project={project}
      selectedProject={selectedProject}
      selectedSession={selectedSession}
      isExpanded={forceExpanded || expandedProjects.has(project.projectId)}
      isDeleting={deletingProjects.has(project.projectId)}
      isStarred={isProjectStarred(project.projectId)}
      editingProject={editingProject}
      editingName={editingName}
      sessions={getProjectSessions(project)}
      initialSessionsLoaded={initialSessionsLoaded.has(project.projectId)}
      isLoadingMoreSessions={loadingMoreProjects.has(project.projectId)}
      currentTime={currentTime}
      editingSession={editingSession}
      editingSessionName={editingSessionName}
      tasksEnabled={tasksEnabled}
      mcpServerStatus={mcpServerStatus}
      onEditingNameChange={onEditingNameChange}
      onToggleProject={onToggleProject}
      onProjectSelect={onProjectSelect}
      onToggleStarProject={onToggleStarProject}
      onStartEditingProject={onStartEditingProject}
      onCancelEditingProject={onCancelEditingProject}
      onSaveProjectName={onSaveProjectName}
      onSaveProjectEmoji={onSaveProjectEmoji}
      onSaveProjectFolder={onSaveProjectFolder}
      existingFolders={existingFolders}
      onDeleteProject={onDeleteProject}
      onSessionSelect={onSessionSelect}
      onDeleteSession={onDeleteSession}
      onLoadMoreSessions={onLoadMoreSessions}
      activeSessions={activeSessions}
      attentionSessionIds={attentionSessionIds}
      onNewSession={onNewSession}
      onEditingSessionNameChange={onEditingSessionNameChange}
      onStartEditingSession={onStartEditingSession}
      onCancelEditingSession={onCancelEditingSession}
      onSaveEditingSession={onSaveEditingSession}
      t={t}
    />
  );

  return (
    <div className="pb-safe-area-inset-bottom md:space-y-1">
      {!showProjects ? (
        state
      ) : (
        <>
          {folderGroups.map(([folder, folderProjects]) => {
            // While searching, collapsed folders stay open so matches are visible.
            const isCollapsed = !searchActive && collapsedFolders.has(folder);
            return (
              <div key={`folder:${folder}`}>
                <button
                  className="flex w-full items-center gap-2 px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground md:px-2 md:py-1.5"
                  onClick={() => toggleFolder(folder)}
                >
                  {isCollapsed ? (
                    <ChevronRight className="h-3 w-3 flex-shrink-0" />
                  ) : (
                    <ChevronDown className="h-3 w-3 flex-shrink-0" />
                  )}
                  {isCollapsed ? (
                    <Folder className="h-3.5 w-3.5 flex-shrink-0" />
                  ) : (
                    <FolderOpen className="h-3.5 w-3.5 flex-shrink-0" />
                  )}
                  <span className="min-w-0 truncate normal-case">{folder}</span>
                  <span className="ml-auto flex-shrink-0 font-normal">{folderProjects.length}</span>
                </button>
                {!isCollapsed && <div className="md:pl-3">{folderProjects.map(renderProject)}</div>}
              </div>
            );
          })}
          {ungroupedProjects.map(renderProject)}
        </>
      )}
    </div>
  );
}
