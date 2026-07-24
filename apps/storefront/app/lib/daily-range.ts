import { bookingDateRangeSchema } from '@booking/contracts';
import { canOffsetDateOnly, isValidDateOnly } from './date-only';
import { addDays, nightsBetween } from './time';

export interface NormalizedDailyRange {
  selectedFrom: string;
  selectedTo: string;
  from: string;
  to: string;
  nights: number;
}

export function normalizeDailyRange(
  from: string | undefined,
  to: string | undefined,
): NormalizedDailyRange | null {
  if (!from || !to || !isValidDateOnly(from) || !isValidDateOnly(to) || to < from) {
    return null;
  }
  if (to === from && !canOffsetDateOnly(from, 1)) return null;

  const effectiveTo = to === from ? addDays(from, 1) : to;
  if (!bookingDateRangeSchema.safeParse({ from, to: effectiveTo }).success) return null;

  return {
    selectedFrom: from,
    selectedTo: to,
    from,
    to: effectiveTo,
    nights: nightsBetween(from, effectiveTo),
  };
}

export function isDailyRangeEligible(
  range: NormalizedDailyRange,
  minNights: number,
  maxNights?: number | null,
): boolean {
  return range.nights >= minNights && (maxNights == null || range.nights <= maxNights);
}

export function eligibleDailyRange(
  from: string | undefined,
  to: string | undefined,
  minNights: number,
  maxNights?: number | null,
): NormalizedDailyRange | null {
  const range = normalizeDailyRange(from, to);
  return range && isDailyRangeEligible(range, minNights, maxNights) ? range : null;
}

/** Enumerates a previously validated range without re-reading untrusted URL bounds. */
export function datesInDailyRange(range: NormalizedDailyRange): string[] {
  return Array.from({ length: range.nights }, (_, index) => addDays(range.from, index));
}
