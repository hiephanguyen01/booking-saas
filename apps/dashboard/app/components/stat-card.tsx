import type { ReactNode } from 'react';
import { cn } from '@booking/ui/lib/utils';
import { Card, CardContent } from '@booking/ui/components/ui/card';

/**
 * Value tone for a KPI figure. `warning` uses the themeable `--warning` token
 * (never hardcoded amber); `positive`/`negative` keep the emerald/rose status
 * semantics. `critical` is an alias of `negative` for "a metric that should be
 * zero is not" (webhook failures, overdue payouts).
 */
export type StatTone = 'default' | 'positive' | 'negative' | 'critical' | 'warning' | 'muted';

const TONE_TEXT: Record<StatTone, string> = {
  default: 'text-foreground',
  positive: 'text-success',
  negative: 'text-destructive',
  critical: 'text-destructive',
  warning: 'text-warning',
  muted: 'text-muted-foreground',
};

export interface StatCardProps {
  label: ReactNode;
  value: ReactNode;
  /** Secondary line under the figure. */
  hint?: ReactNode;
  /** An already-rendered icon element, e.g. `<Wallet className="size-4" />`. */
  icon?: ReactNode;
  tone?: StatTone;
  className?: string;
}

/** A single KPI tile — a large tabular figure with a label and optional hint. */
export function StatCard({ label, value, hint, icon, tone = 'default', className }: StatCardProps) {
  return (
    <Card className={cn('overflow-hidden', className)}>
      <CardContent className="flex flex-col gap-2 p-5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </span>
          {icon ? <span className="text-muted-foreground">{icon}</span> : null}
        </div>
        <span className={cn('text-2xl font-semibold leading-tight tabular-nums', TONE_TEXT[tone])}>
          {value}
        </span>
        {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
      </CardContent>
    </Card>
  );
}

export type BarTone = 'primary' | 'emerald' | 'warning' | 'rose' | 'sky';

const BAR_FILL: Record<BarTone, string> = {
  primary: 'bg-primary',
  emerald: 'bg-success',
  warning: 'bg-warning',
  rose: 'bg-destructive',
  sky: 'bg-info',
};

export interface BarRowProps {
  label: string;
  value: number;
  max: number;
  /** The formatted figure shown on the right (e.g. a VND amount). */
  display: string;
  tone?: BarTone;
}

/** A horizontal proportion bar for a labelled amount (dependency-free chart). */
export function BarRow({ label, value, max, display, tone = 'primary' }: BarRowProps) {
  const pct = max > 0 ? Math.min(100, Math.max(2, (Math.abs(value) / max) * 100)) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="truncate text-muted-foreground">{label}</span>
        <span className="shrink-0 font-medium tabular-nums">{display}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={cn('h-full rounded-full transition-all', BAR_FILL[tone])}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
