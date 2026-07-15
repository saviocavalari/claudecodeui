import { useState } from 'react';
import ReactDOM from 'react-dom';
import { X } from 'lucide-react';
import type { TFunction } from 'i18next';

import { Button } from '../../../../shared/view/ui';

// Curated picker options. The emoji literals below are picker data, not
// decorative characters in code.
const EMOJI_OPTIONS = [
  '💊', '🧪', '🧬', '🩺', '🏥', '💉', '🌿', '🧴',
  '🛒', '🛍️', '💰', '💳', '📈', '📊', '🏦', '🧾',
  '📢', '🎯', '✉️', '📱', '🌐', '🔍', '🎨', '📸',
  '🤖', '⚙️', '🔧', '🧠', '💻', '🖥️', '🔌', '🗄️',
  '📦', '🚚', '🏭', '🏪', '📋', '📁', '🗂️', '📌',
  '⭐', '🔥', '🚀', '💡', '❤️', '✅', '⚠️', '🧲',
];

type ProjectEmojiModalProps = {
  projectDisplayName: string;
  currentEmoji: string | null;
  onClose: () => void;
  onSelect: (emoji: string | null) => void;
  t: TFunction;
};

export default function ProjectEmojiModal({
  projectDisplayName,
  currentEmoji,
  onClose,
  onSelect,
  t,
}: ProjectEmojiModalProps) {
  const [customEmoji, setCustomEmoji] = useState('');

  const selectAndClose = (emoji: string | null) => {
    onSelect(emoji);
    onClose();
  };

  const applyCustomEmoji = () => {
    const trimmed = customEmoji.trim();
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
            {t('projects.chooseEmoji')}{' '}
            <span className="font-normal text-muted-foreground">{projectDisplayName}</span>
          </h3>
          <button
            className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded hover:bg-accent"
            onClick={onClose}
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        <div className="grid grid-cols-8 gap-1 p-4">
          {EMOJI_OPTIONS.map((emoji) => (
            <button
              key={emoji}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-xl transition-colors hover:bg-accent"
              onClick={() => selectAndClose(emoji)}
            >
              {emoji}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 border-t border-border p-4">
          <input
            type="text"
            value={customEmoji}
            onChange={(event) => setCustomEmoji(event.target.value)}
            placeholder={t('projects.emojiCustomPlaceholder')}
            className="min-w-0 flex-1 rounded border border-border bg-background px-2 py-1.5 text-sm text-foreground focus:ring-2 focus:ring-primary/20"
            maxLength={16}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                applyCustomEmoji();
              }
              if (event.key === 'Escape') {
                onClose();
              }
            }}
          />
          <Button size="sm" onClick={applyCustomEmoji} disabled={customEmoji.trim().length === 0}>
            {t('actions.save', 'Save')}
          </Button>
        </div>

        {currentEmoji && (
          <div className="border-t border-border p-2">
            <Button
              variant="ghost"
              className="w-full text-muted-foreground"
              onClick={() => selectAndClose(null)}
            >
              {t('projects.removeEmoji')}
            </Button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
