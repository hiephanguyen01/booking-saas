import type { LucideIcon } from 'lucide-react';
import { cn } from '@booking/ui/lib/utils';

type Tone = 'default' | 'critical';

/**
 * A single KPI on the health board. Numbers use tabular-nums so columns of
 * figures stay aligned. `tone="critical"` tints the value when a metric that
 * should be zero (webhook failures, overdue payouts) is not.
 */
export function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  tone = 'default',
}: {
  label: string;
  value: string;
  sub?: string;
  icon?: LucideIcon;
  tone?: Tone;
}) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        {Icon ? (
          <Icon
            className={cn(
              'size-4 shrink-0',
              tone === 'critical' ? 'text-rose-500' : 'text-muted-foreground/70',
            )}
            aria-hidden
          />
        ) : null}
      </div>
      <div
        className={cn(
          'mt-2 text-2xl font-semibold tabular-nums tracking-tight',
          tone === 'critical' && 'text-rose-600 dark:text-rose-400',
        )}
      >
        {value}
      </div>
      {sub ? <p className="mt-1 text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  );
}
