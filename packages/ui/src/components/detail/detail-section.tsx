import * as React from 'react';

import { cn } from '@booking/ui/lib/utils';

export interface DetailSectionProps {
  /** Uppercase-tracked muted heading — the label for the block. */
  title: string;
  /** Optional secondary line under the title. */
  description?: React.ReactNode;
  /** Optional controls rendered on the right of the heading row. */
  actions?: React.ReactNode;
  /**
   * Rendered instead of the body when `children` resolve to nothing (all
   * nullish/false/whitespace). Lets a consumer render a section unconditionally
   * and still get a tidy empty state.
   */
  emptyMessage?: string;
  className?: string;
  children?: React.ReactNode;
}

/**
 * True when `children` carry no meaningful content — every child is nullish,
 * `false`, or a whitespace-only string. `React.Children.toArray` already drops
 * `null`/`undefined`/booleans and flattens fragments; we additionally treat
 * empty/whitespace strings as nothing.
 */
export function isDetailSectionEmpty(children: React.ReactNode): boolean {
  const meaningful = React.Children.toArray(children).filter(
    (child) => !(typeof child === 'string' && child.trim() === ''),
  );
  return meaningful.length === 0;
}

/**
 * A titled block for a detail view. NOT a Card — it composes *inside* a
 * `<Card>` (or stands alone). Mirrors the `Section` pattern in the dashboard's
 * booking-detail-card so it is a drop-in upgrade, not a restyle.
 */
export function DetailSection({
  title,
  description,
  actions,
  emptyMessage,
  className,
  children,
}: DetailSectionProps): React.JSX.Element {
  const showEmpty = emptyMessage !== undefined && isDetailSectionEmpty(children);

  return (
    <section className={cn('space-y-3', className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {title}
          </h3>
          {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {showEmpty ? <p className="text-sm text-muted-foreground">{emptyMessage}</p> : children}
    </section>
  );
}
