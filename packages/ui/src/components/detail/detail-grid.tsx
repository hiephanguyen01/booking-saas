import * as React from 'react';

import { cn } from '@booking/ui/lib/utils';

export interface DetailGridProps {
  /** Column count from `sm` upward — 1 col on mobile always. Default 2. */
  columns?: 1 | 2 | 3;
  className?: string;
  children?: React.ReactNode;
}

/** Responsive column classes: 1 col on mobile, `columns` from `sm`/`lg` up. */
const COLUMN_CLASS: Record<NonNullable<DetailGridProps['columns']>, string> = {
  1: '',
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-2 lg:grid-cols-3',
};

/**
 * The `<dl>` container for a set of `DetailField`s. Matches the
 * `grid gap-x-6 gap-y-4 sm:grid-cols-2` layout the dashboard detail pages use.
 */
export function DetailGrid({
  columns = 2,
  className,
  children,
}: DetailGridProps): React.JSX.Element {
  return (
    <dl className={cn('grid grid-cols-1 gap-x-6 gap-y-4', COLUMN_CLASS[columns], className)}>
      {children}
    </dl>
  );
}
