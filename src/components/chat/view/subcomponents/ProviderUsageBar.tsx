import { useEffect, useState } from 'react';

import type { LLMProvider } from '../../../../types/app';
import { authenticatedFetch } from '../../../../utils/api';

type UsageWindow = {
  id: 'current' | 'weekly';
  label: string;
  usedPercent: number;
  remainingPercent: number;
  resetsAt: string | null;
};

type UsageLimits = {
  provider: 'claude' | 'codex';
  available: boolean;
  windows: UsageWindow[];
};

const colorForRemaining = (remaining: number) => (
  remaining <= 10 ? 'bg-red-500' : remaining <= 30 ? 'bg-amber-500' : 'bg-emerald-500'
);

const formatReset = (value: string | null) => {
  if (!value) return '';
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
};

export default function ProviderUsageBar({ provider }: { provider: LLMProvider }) {
  const [limits, setLimits] = useState<UsageLimits | null>(null);

  useEffect(() => {
    if (provider !== 'claude' && provider !== 'codex') {
      setLimits(null);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const response = await authenticatedFetch(`/api/providers/${provider}/usage-limits`);
        const payload = await response.json();
        if (!cancelled) setLimits(payload?.data ?? null);
      } catch {
        if (!cancelled) setLimits(null);
      }
    };
    void load();
    const timer = window.setInterval(load, 120_000);
    const refreshVisible = () => document.visibilityState === 'visible' && void load();
    document.addEventListener('visibilitychange', refreshVisible);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refreshVisible);
    };
  }, [provider]);

  if (!limits?.available || limits.windows.length === 0) return null;

  return (
    <div className="flex flex-shrink-0 items-center gap-3 border-b border-border/50 bg-background/95 px-3 py-2 backdrop-blur-md sm:px-4">
      <span className="hidden text-xs font-semibold sm:inline">
        {limits.provider === 'claude' ? 'Claude' : 'Codex'}
      </span>
      <div className="flex min-w-0 flex-1 gap-3 sm:gap-5">
        {limits.windows.map((window) => (
          <div key={window.id} className="min-w-0 flex-1">
            <div className="mb-1 flex items-center justify-between gap-2 text-[11px] leading-none">
              <span className="truncate text-muted-foreground">{window.label}</span>
              <span className="whitespace-nowrap font-semibold">
                {window.remainingPercent}% restante
                <span className="hidden font-normal text-muted-foreground md:inline">
                  {window.resetsAt ? ` · renova ${formatReset(window.resetsAt)}` : ''}
                </span>
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full rounded-full transition-[width] duration-500 ${colorForRemaining(window.remainingPercent)}`}
                style={{ width: `${window.remainingPercent}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
