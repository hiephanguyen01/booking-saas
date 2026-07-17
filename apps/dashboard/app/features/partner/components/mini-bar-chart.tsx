import { cn } from '@booking/ui/lib/utils';

export interface BarDatum {
  label: string;
  sublabel?: string;
  value: number;
  highlight?: boolean;
}

/**
 * Lightweight, SSR-safe categorical bar chart (no chart lib) for dashboard
 * trends. Bars scale to the series max; zero-value bars keep a faint track so
 * the axis reads as continuous.
 */
export function MiniBarChart({ data, unit }: { data: BarDatum[]; unit?: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="flex h-40 items-end gap-1.5">
      {data.map((d, i) => {
        const pct = Math.round((d.value / max) * 100);
        return (
          <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
            <div className="flex w-full flex-1 items-end" title={`${d.label}: ${d.value}${unit ? ` ${unit}` : ''}`}>
              <div
                className={cn(
                  'w-full rounded-t-sm transition-all',
                  d.value === 0 ? 'bg-muted' : d.highlight ? 'bg-primary' : 'bg-primary/40',
                )}
                style={{ height: `${Math.max(pct, d.value === 0 ? 4 : 8)}%` }}
              />
            </div>
            <span className="text-[10px] leading-none text-muted-foreground">{d.label}</span>
          </div>
        );
      })}
    </div>
  );
}
