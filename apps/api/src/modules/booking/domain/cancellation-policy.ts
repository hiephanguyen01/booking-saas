import { percentOfBps, type Vnd } from '../../../shared/money/money';

/**
 * Cancellation refund policy (TONG-QUAN.md §11.3). `rules` is a tiered array
 * from `cancellation_policies.rules`, e.g.
 *   [{hoursBefore:168, refundPercent:100}, {hoursBefore:48, refundPercent:50}, {hoursBefore:0, refundPercent:0}]
 * Pure — the use case supplies `hoursUntilStart` and the snapshotted rules.
 */
export interface CancellationTier {
  hoursBefore: number;
  refundPercent: number;
}

export function hoursUntil(startUtc: Date, now: Date): number {
  return (startUtc.getTime() - now.getTime()) / 3_600_000;
}

/** Refund % for a **customer** cancellation this many hours before the start. */
export function refundPercent(rules: readonly CancellationTier[], hoursUntilStart: number): number {
  const sorted = [...rules].sort((a, b) => b.hoursBefore - a.hoursBefore);
  for (const tier of sorted) {
    if (hoursUntilStart >= tier.hoursBefore) return clampPercent(tier.refundPercent);
  }
  return 0; // past the last tier (e.g. after the start) → no refund
}

/** refund = paid × percent% (same rounding as pricing deposits). */
export function computeRefund(paidAmount: Vnd, percent: number): Vnd {
  return percentOfBps(paidAmount, clampPercent(percent) * 100);
}

function clampPercent(p: number): number {
  return Math.max(0, Math.min(100, p));
}
