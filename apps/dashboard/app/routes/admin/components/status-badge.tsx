import { cn } from '@booking/ui/lib/utils';
import {
  SUBSCRIPTION_STATUS_LABELS,
  TENANT_STATUS_LABELS,
} from '~/lib/format';

type Tone = 'positive' | 'warning' | 'critical' | 'neutral';

const TONE_CLASS: Record<Tone, string> = {
  positive:
    'bg-emerald-500/12 text-emerald-700 ring-emerald-600/25 dark:text-emerald-300 dark:ring-emerald-400/25',
  warning:
    'bg-warning/15 text-warning-foreground ring-warning/30 dark:text-warning dark:ring-warning/25',
  critical:
    'bg-rose-500/12 text-rose-700 ring-rose-600/25 dark:text-rose-300 dark:ring-rose-400/25',
  neutral: 'bg-muted text-muted-foreground ring-border',
};

const DOT_CLASS: Record<Tone, string> = {
  positive: 'bg-emerald-500',
  warning: 'bg-warning',
  critical: 'bg-rose-500',
  neutral: 'bg-muted-foreground/50',
};

const TENANT_TONE: Record<string, Tone> = {
  active: 'positive',
  suspended: 'critical',
  expired: 'warning',
};

const SUBSCRIPTION_TONE: Record<string, Tone> = {
  active: 'positive',
  trial: 'neutral',
  past_due: 'warning',
  expired: 'warning',
  cancelled: 'critical',
};

/** Pill with a live-state dot — used only for real status, never decoration. */
function StatePill({ tone, label }: { tone: Tone; label: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
        TONE_CLASS[tone],
      )}
    >
      <span className={cn('size-1.5 rounded-full', DOT_CLASS[tone])} aria-hidden />
      {label}
    </span>
  );
}

export function TenantStatusBadge({ status }: { status: string }) {
  return (
    <StatePill
      tone={TENANT_TONE[status] ?? 'neutral'}
      label={TENANT_STATUS_LABELS[status] ?? status}
    />
  );
}

export function SubscriptionStatusBadge({ status }: { status: string }) {
  return (
    <StatePill
      tone={SUBSCRIPTION_TONE[status] ?? 'neutral'}
      label={SUBSCRIPTION_STATUS_LABELS[status] ?? status}
    />
  );
}

/** A numeric health signal: 0 reads calm, any positive count reads critical. */
export function CountSignal({ count, unit }: { count: number; unit?: string }) {
  if (count <= 0) {
    return <span className="text-sm text-muted-foreground tabular-nums">0</span>;
  }
  return (
    <StatePill tone="critical" label={unit ? `${count} ${unit}` : String(count)} />
  );
}
