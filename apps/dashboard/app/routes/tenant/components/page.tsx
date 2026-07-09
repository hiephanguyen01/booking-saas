import type { ReactNode } from 'react';
import { cn } from '@booking/ui/lib/utils';
import { Card, CardContent } from '@booking/ui/components/ui/card';

/** Standard screen header: title, optional description, optional right-aligned actions. */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/** A single KPI tile — large tabular figure with a label and optional hint. */
export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = 'default',
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: 'default' | 'positive' | 'negative' | 'muted';
  className?: string;
}) {
  const toneClass =
    tone === 'positive'
      ? 'text-emerald-600 dark:text-emerald-400'
      : tone === 'negative'
        ? 'text-rose-600 dark:text-rose-400'
        : tone === 'muted'
          ? 'text-muted-foreground'
          : 'text-foreground';
  return (
    <Card className={cn('overflow-hidden', className)}>
      <CardContent className="flex flex-col gap-2 p-5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
          {icon ? <span className="text-muted-foreground">{icon}</span> : null}
        </div>
        <span className={cn('text-2xl font-semibold tabular-nums leading-tight', toneClass)}>{value}</span>
        {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
      </CardContent>
    </Card>
  );
}

/** A horizontal proportion bar for a labeled amount (dependency-free chart). */
export function BarRow({
  label,
  value,
  max,
  display,
  tone = 'primary',
}: {
  label: string;
  value: number;
  max: number;
  display: string;
  tone?: 'primary' | 'emerald' | 'amber' | 'rose' | 'sky';
}) {
  const pct = max > 0 ? Math.min(100, Math.max(2, (Math.abs(value) / max) * 100)) : 0;
  const fill =
    tone === 'emerald'
      ? 'bg-emerald-500'
      : tone === 'amber'
        ? 'bg-amber-500'
        : tone === 'rose'
          ? 'bg-rose-500'
          : tone === 'sky'
            ? 'bg-sky-500'
            : 'bg-primary';
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="truncate text-muted-foreground">{label}</span>
        <span className="shrink-0 font-medium tabular-nums">{display}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className={cn('h-full rounded-full transition-all', fill)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
