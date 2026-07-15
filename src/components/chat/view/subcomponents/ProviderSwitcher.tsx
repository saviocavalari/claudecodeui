import { useEffect, useRef, useState } from 'react';
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
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleClickOutside = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

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
    <div ref={containerRef} className="relative flex justify-center py-1">
      <button
        type="button"
        className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground shadow-sm transition-colors hover:bg-accent hover:text-foreground disabled:opacity-60"
        onClick={() => setIsOpen((previous) => !previous)}
        disabled={isSwitching}
        title={t('providerSwitch.tooltip', 'Continue this conversation with another AI')}
      >
        {isSwitching ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Repeat2 className="h-3.5 w-3.5" />
        )}
        <span>{t('providerSwitch.button', 'Switch AI')}</span>
        <ChevronDown className="h-3 w-3" />
      </button>

      {isOpen && (
        <div className="absolute top-full z-30 mt-1 w-56 overflow-hidden rounded-lg border border-border bg-card shadow-xl">
          <div className="border-b border-border px-3 py-2 text-xs text-muted-foreground">
            {t('providerSwitch.heading', 'Continue with:')}
          </div>
          {otherProviders.map((candidate) => (
            <button
              key={candidate}
              type="button"
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-accent"
              onClick={() => {
                void handleSelect(candidate);
              }}
            >
              <SessionProviderLogo provider={candidate} className="h-4 w-4 shrink-0" />
              <span>{PROVIDER_LABELS[candidate]}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
