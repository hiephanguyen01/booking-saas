import { cn } from '@booking/ui/lib/utils';
import { formatDateTime } from '~/lib/format';

export interface TimelineEntry {
  /** What happened, e.g. "Đã xác nhận". */
  label: string;
  /** ISO instant the entry occurred. */
  at: string;
  /** Who performed it, if known. */
  actor?: string | null;
  /** Free-text note (cancellation/rejection reason). */
  reason?: string | null;
}

export interface TimelineProps {
  entries: TimelineEntry[];
  className?: string;
}

export interface ResolvedTimelineRow {
  entry: TimelineEntry;
  /** The last row draws no connector below its dot. */
  isLast: boolean;
  /** Timezone-correct formatted timestamp. */
  time: string;
}

/** Pure shaping: preserves the given order, marks the last row, formats each time. */
export function resolveTimeline(entries: TimelineEntry[]): ResolvedTimelineRow[] {
  return entries.map((entry, i) => ({
    entry,
    isLast: i === entries.length - 1,
    time: formatDateTime(entry.at),
  }));
}

/**
 * A vertical status/audit timeline for booking history: a muted connector line
 * threads dots down the left; each row shows the label, a tabular timestamp,
 * and optional actor/reason.
 */
export function Timeline({ entries, className }: TimelineProps) {
  const rows = resolveTimeline(entries);
  if (rows.length === 0) return null;
  return (
    <ol className={cn('space-y-0', className)}>
      {rows.map(({ entry, isLast, time }, i) => (
        <li key={i} className="relative flex gap-3 pb-4 last:pb-0">
          {!isLast ? (
            <span className="absolute left-[5px] top-3 -bottom-1 w-px bg-border" aria-hidden />
          ) : null}
          <span
            className="relative mt-1.5 size-2.5 shrink-0 rounded-full border-2 border-background bg-muted-foreground"
            aria-hidden
          />
          <div className="min-w-0 flex-1 space-y-0.5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span className="text-sm font-medium">{entry.label}</span>
              <time className="text-xs tabular-nums text-muted-foreground">{time}</time>
            </div>
            {entry.actor ? <p className="text-xs text-muted-foreground">{entry.actor}</p> : null}
            {entry.reason ? <p className="text-sm text-muted-foreground">{entry.reason}</p> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
