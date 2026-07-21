import { isValidDateOnly } from './date-only';
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
  const effectiveTo = to === from ? addDays(from, 1) : to;
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
