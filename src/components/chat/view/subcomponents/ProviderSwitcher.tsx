import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Loader2, Repeat2 } from 'lucide-react';

import { api } from '../../../../utils/api';
import type { LLMProvider } from '../../../../types/app';
import SessionProviderLogo from '../../../llm-logo-provider/SessionProviderLogo';

const PROVIDER_LABELS: Record<LLMProvider, string> = {
  claude: 'Claude',
  codex: 'ChatGPT (Codex)',
  cursor: 'Cursor',
  opencode: 'OpenCode',
};

const PROVIDER_ORDER: LLMProvider[] = ['claude', 'codex', 'cursor', 'opencode'];

type ProviderSwitcherProps = {
  currentSessionId: string | null;
  provider: LLMProvider;
  setProvider: (provider: LLMProvider) => void;
  onNavigateToSession?: (sessionId: string) => void;
};

/**
 * Lets the user continue an in-progress conversation on a different AI
 * provider. The backend creates a sibling session bound to the chosen provider
 * and carries the transcript over as context for its first message; here we
 * just navigate to that new session.
 *
 * Lives in the composer toolbar, so the menu opens upward (like the effort
 * dropdown) and is portaled to <body> to escape the toolbar's clipping.
 */
export default function ProviderSwitcher({
  currentSessionId,
  provider,
  setProvider,
  onNavigateToSession,
}: ProviderSwitcherProps) {
  const { t } = useTranslation('chat');
  const [isOpen, setIsOpen] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ left: number; top: number } | null>(null);

  const updateMenuPosition = useCallback(() => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }
    setMenuPosition({ left: rect.left, top: rect.top - 8 });
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!buttonRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('resize', updateMenuPosition);
    window.addEventListener('scroll', updateMenuPosition, true);
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    updateMenuPosition();

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('resize', updateMenuPosition);
      window.removeEventListener('scroll', updateMenuPosition, true);
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
    };
  }, [isOpen, updateMenuPosition]);

  const handleSelect = async (nextProvider: LLMProvider) => {
    setIsOpen(false);
    if (!currentSessionId || nextProvider === provider || isSwitching) {
      return;
    }

    setIsSwitching(true);
    try {
      const response = await api.switchSessionProvider(currentSessionId, nextProvider);
      if (!response.ok) {
        throw new Error(`Failed to switch provider (${response.status})`);
      }

      const body = await response.json();
      const newSessionId: string | null = body?.data?.sessionId ?? null;
      if (!newSessionId) {
        throw new Error('No session id returned');
      }

      // Keep the default provider in sync so the placeholder session that the
      // URL resolves to renders with the right logo before the row loads.
      try {
        localStorage.setItem('selected-provider', nextProvider);
      } catch {
        // Best-effort only.
      }

      setProvider(nextProvider);
      onNavigateToSession?.(newSessionId);
    } catch (error) {
      console.error('[ProviderSwitcher] switch failed:', error);
      alert(t('providerSwitch.error', 'Could not switch the AI. Please try again.'));
    } finally {
      setIsSwitching(false);
    }
  };

  if (!currentSessionId) {
    return null;
  }

  const otherProviders = PROVIDER_ORDER.filter((candidate) => candidate !== provider);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="flex h-8 items-center gap-1.5 rounded-lg border border-border/60 bg-muted/40 px-2 text-xs font-medium text-foreground transition-all duration-200 hover:bg-muted disabled:opacity-60"
        onClick={() => {
          updateMenuPosition();
          setIsOpen((previous) => !previous);
        }}
        disabled={isSwitching}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        title={t('providerSwitch.tooltip', 'Continue this conversation with another AI')}
      >
        {isSwitching ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Repeat2 className="h-3.5 w-3.5" />
        )}
        <span className="hidden sm:inline">{t('providerSwitch.button', 'Switch AI')}</span>
        <ChevronDown className={`h-3 w-3 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && menuPosition && createPortal(
        <div
          ref={menuRef}
          role="menu"
          className="fixed z-[100] w-56 overflow-hidden rounded-lg border border-border bg-card shadow-xl"
          style={{ left: menuPosition.left, top: menuPosition.top, transform: 'translateY(-100%)' }}
        >
          <div className="border-b border-border px-3 py-2 text-xs text-muted-foreground">
            {t('providerSwitch.heading', 'Continue with:')}
          </div>
          {otherProviders.map((candidate) => (
            <button
              key={candidate}
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-accent"
              onClick={() => {
                void handleSelect(candidate);
              }}
            >
              <SessionProviderLogo provider={candidate} className="h-4 w-4 shrink-0" />
              <span>{PROVIDER_LABELS[candidate]}</span>
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}
