import { useTranslation } from 'react-i18next';

/**
 * How much of the model's context window the open conversation occupies, and
 * the control that frees it up.
 *
 * The backend already streams a token budget on every turn; this surfaces it so
 * compaction becomes a decision instead of a guess. It only appears once a turn
 * has reported usage — a fresh chat has nothing to measure.
 */

/** Below this the meter stays neutral: there is nothing to act on yet. */
const NOTICE_THRESHOLD = 50;

/** From here the window is filling up and compacting starts to pay off. */
const WARNING_THRESHOLD = 75;

/** From here a turn may be dropped for lack of room; compaction is overdue. */
const CRITICAL_THRESHOLD = 90;

type ComposerContextMeterProps = {
  /** Token budget as reported by the provider runtime. */
  tokenBudget: Record<string, unknown> | null;
  /** Fires the conversation-summarizing command. */
  onCompact: () => void;
  /** True while a compaction turn is in flight. */
  isCompacting: boolean;
  /** Disables the action while another turn owns the session. */
  disabled?: boolean;
};

const readNumber = (value: unknown): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};

/** Compact token count for a control that has to fit next to the send button. */
const formatTokens = (tokens: number): string => {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  }
  if (tokens >= 1_000) {
    return `${Math.round(tokens / 1_000)}k`;
  }
  return String(tokens);
};

export default function ComposerContextMeter({
  tokenBudget,
  onCompact,
  isCompacting,
  disabled = false,
}: ComposerContextMeterProps) {
  const { t } = useTranslation('chat');

  const used = readNumber(tokenBudget?.used);
  const total = readNumber(tokenBudget?.total);
  if (!total || !used) {
    return null;
  }

  // Clamped for display only: a turn can legitimately report past the window.
  const percentage = Math.min(100, Math.round((used / total) * 100));

  const tone = percentage >= CRITICAL_THRESHOLD
    ? {
        bar: 'bg-red-500',
        text: 'text-red-600 dark:text-red-400',
        trigger: 'border-red-300/60 bg-red-50 hover:bg-red-100 dark:border-red-600/40 dark:bg-red-900/15 dark:hover:bg-red-900/25',
      }
    : percentage >= WARNING_THRESHOLD
      ? {
          bar: 'bg-amber-500',
          text: 'text-amber-600 dark:text-amber-400',
          trigger: 'border-amber-300/60 bg-amber-50 hover:bg-amber-100 dark:border-amber-600/40 dark:bg-amber-900/15 dark:hover:bg-amber-900/25',
        }
      : {
          bar: percentage >= NOTICE_THRESHOLD ? 'bg-muted-foreground/70' : 'bg-muted-foreground/50',
          text: 'text-muted-foreground',
          trigger: 'border-border/60 bg-muted/40 hover:bg-muted',
        };

  const label = t('composer.contextUsed', {
    percentage,
    used: formatTokens(used),
    total: formatTokens(total),
    defaultValue: '{{percentage}}% of the context used ({{used}} of {{total}} tokens). Click to summarize the conversation and free it up.',
  });

  return (
    <button
      type="button"
      onClick={onCompact}
      disabled={disabled || isCompacting}
      className={`flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${tone.trigger}`}
      title={label}
      aria-label={label}
    >
      {/* Track is decorative: the percentage next to it carries the value. */}
      <span aria-hidden="true" className="h-1.5 w-8 overflow-hidden rounded-full bg-border/70 sm:w-10">
        <span
          className={`block h-full rounded-full transition-[width] duration-300 ${tone.bar}`}
          style={{ width: `${Math.max(percentage, 2)}%` }}
        />
      </span>
      <span className={`tabular-nums ${tone.text}`}>
        {isCompacting
          ? t('composer.compacting', { defaultValue: 'Summarizing…' })
          : `${percentage}%`}
      </span>
    </button>
  );
}
