import { useState } from 'react';
import ReactDOM from 'react-dom';
import { Folder, FolderPlus, X } from 'lucide-react';
import type { TFunction } from 'i18next';

import { Button } from '../../../../shared/view/ui';

type ProjectFolderModalProps = {
  projectDisplayName: string;
  currentFolder: string | null;
  existingFolders: string[];
  onClose: () => void;
  onSelect: (folder: string | null) => void;
  t: TFunction;
};

export default function ProjectFolderModal({
  projectDisplayName,
  currentFolder,
  existingFolders,
  onClose,
  onSelect,
  t,
}: ProjectFolderModalProps) {
  const [newFolderName, setNewFolderName] = useState('');

  const selectAndClose = (folder: string | null) => {
    onSelect(folder);
    onClose();
  };

  const createFolder = () => {
    const trimmed = newFolderName.trim();
    if (trimmed.length > 0) {
      selectAndClose(trimmed);
    }
  };

  return ReactDOM.createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border p-4">
          <h3 className="min-w-0 truncate text-sm font-semibold text-foreground">
            {t('projects.moveToFolder')}{' '}
            <span className="font-normal text-muted-foreground">{projectDisplayName}</span>
          </h3>
          <button
            className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded hover:bg-accent"
            onClick={onClose}
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {existingFolders.length > 0 && (
          <div className="max-h-56 overflow-y-auto p-2">
            {existingFolders.map((folder) => (
              <button
                key={folder}
                className={
                  'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-accent ' +
                  (folder === currentFolder ? 'bg-accent font-medium' : 'text-foreground')
                }
                onClick={() => selectAndClose(folder)}
              >
                <Folder className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                <span className="truncate">{folder}</span>
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 border-t border-border p-4">
          <FolderPlus className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
          <input
            type="text"
            value={newFolderName}
            onChange={(event) => setNewFolderName(event.target.value)}
            placeholder={t('projects.newFolderPlaceholder')}
            className="min-w-0 flex-1 rounded border border-border bg-background px-2 py-1.5 text-sm text-foreground focus:ring-2 focus:ring-primary/20"
            maxLength={60}
            autoFocus={existingFolders.length === 0}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                createFolder();
              }
              if (event.key === 'Escape') {
                onClose();
              }
            }}
          />
          <Button size="sm" onClick={createFolder} disabled={newFolderName.trim().length === 0}>
            {t('projects.createFolder')}
          </Button>
        </div>

        {currentFolder && (
          <div className="border-t border-border p-2">
            <Button
              variant="ghost"
              className="w-full text-muted-foreground"
              onClick={() => selectAndClose(null)}
            >
              {t('projects.removeFromFolder')}
            </Button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
