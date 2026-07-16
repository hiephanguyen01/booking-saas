import { cn } from '@booking/ui/lib/utils';
import { formatVnd, formatVndCompact } from '~/lib/format';

export interface MoneyProps {
  /** VND đồng amount — a digit string (preferred), bigint, or number. */
  value: string | bigint | number | null | undefined;
  /** Render the compact `1,2 tr` form; the exact amount stays in the tooltip. */
  compact?: boolean;
  className?: string;
}

/**
 * A VND amount rendered `tabular-nums`, with the exact full amount always in the
 * `title` (so a compact figure stays auditable on hover). Parsing goes through
 * `formatVnd` (bigint), never a float.
 */
export function Money({ value, compact, className }: MoneyProps) {
  const exact = formatVnd(value);
  return (
    <span className={cn('tabular-nums', className)} title={exact}>
      {compact ? formatVndCompact(value) : exact}
    </span>
  );
}

/**
 * The credit/debit tint for a signed money figure — the ONE place these tints
 * live (mirrors `StatCard`'s positive/negative tones). `positive` = a credit /
 * money in; `negative` = a debit / money out.
 */
export function amountToneClass(tone: 'positive' | 'negative'): string {
  return tone === 'positive'
    ? 'text-emerald-600 dark:text-emerald-400'
    : 'text-rose-600 dark:text-rose-400';
}
