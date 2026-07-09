import type { LucideIcon } from 'lucide-react';
import { cn } from '@booking/ui/lib/utils';
import { Card, CardContent } from '@booking/ui/components/ui/card';

/** A single dashboard metric tile: label, big value, optional hint + icon. */
export function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'default',
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: LucideIcon;
  tone?: 'default' | 'positive' | 'warning' | 'negative';
}) {
  const toneText =
    tone === 'positive'
      ? 'text-emerald-600 dark:text-emerald-400'
      : tone === 'warning'
        ? 'text-amber-600 dark:text-amber-400'
        : tone === 'negative'
          ? 'text-rose-600 dark:text-rose-400'
          : 'text-foreground';

  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-3 p-5">
        <div className="min-w-0 space-y-1.5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className={cn('text-2xl font-semibold tabular-nums leading-none', toneText)}>{value}</p>
          {hint ? <p className="truncate text-xs text-muted-foreground">{hint}</p> : null}
        </div>
        {Icon ? (
          <span className="rounded-lg bg-muted p-2 text-muted-foreground">
            <Icon className="size-4" aria-hidden />
          </span>
        ) : null}
      </CardContent>
    </Card>
  );
}
