import * as React from 'react';

import { cn } from '@booking/ui/lib/utils';

export interface DetailRowProps {
  /** Left-aligned label — wraps rather than overflowing on long strings. */
  label: React.ReactNode;
  /** Right-aligned value (ReactNode), rendered `tabular-nums`. */
  value: React.ReactNode;
  /** `strong` → semibold value; `muted` → muted value. */
  emphasis?: 'default' | 'strong' | 'muted';
  className?: string;
}

const VALUE_EMPHASIS: Record<NonNullable<DetailRowProps['emphasis']>, string> = {
  default: '',
  strong: 'font-semibold',
  muted: 'text-muted-foreground',
};

/**
 * Label left, value right on one line — the money-stack row. The label may
 * wrap (it is `min-w-0`); the value stays intact and right-aligned.
 */
export function DetailRow({
  label,
  value,
  emphasis = 'default',
  className,
}: DetailRowProps): React.JSX.Element {
  return (
    <div className={cn('flex justify-between gap-4 text-sm', className)}>
      <span className="min-w-0 text-muted-foreground">{label}</span>
      <span className={cn('shrink-0 text-right tabular-nums', VALUE_EMPHASIS[emphasis])}>
        {value}
      </span>
    </div>
  );
}

export interface DetailRowTotalProps {
  label: React.ReactNode;
  value: React.ReactNode;
  className?: string;
}

/**
 * A visually separated strong total row (top border + semibold) for the
 * "Thành tiền"/"Còn lại" line at the bottom of a payment stack. Also reachable
 * as `DetailRow.Total`.
 */
export function DetailRowTotal({
  label,
  value,
  className,
}: DetailRowTotalProps): React.JSX.Element {
  return (
    <div
      className={cn(
        'mt-2 flex justify-between gap-4 border-t border-border pt-2 text-sm font-semibold',
        className,
      )}
    >
      <span className="min-w-0">{label}</span>
      <span className="shrink-0 text-right tabular-nums">{value}</span>
    </div>
  );
}

DetailRow.Total = DetailRowTotal;
