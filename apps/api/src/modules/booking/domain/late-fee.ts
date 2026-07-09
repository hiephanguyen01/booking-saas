import type { Vnd } from '../../../shared/money/money';

/**
 * Late-return fee for inventory rentals (§9.4). A return after the rental end is
 * charged per overdue unit (hour/day, per the listing's inventory config) × the
 * rate × the quantity of items. Pure.
 */
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

/** Whole overdue units (rounded up) between `dueAt` and `returnedAt`; 0 if on time. */
export function overduePeriods(returnedAt: Date, dueAt: Date, unit: 'hour' | 'day'): number {
  const overdueMs = returnedAt.getTime() - dueAt.getTime();
  if (overdueMs <= 0) return 0;
  return Math.ceil(overdueMs / (unit === 'hour' ? HOUR_MS : DAY_MS));
}

export function lateFee(periods: number, ratePerUnit: Vnd, quantity: number): Vnd {
  if (periods <= 0) return 0n;
  return ratePerUnit * BigInt(periods) * BigInt(quantity);
}
