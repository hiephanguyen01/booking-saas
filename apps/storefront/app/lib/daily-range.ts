import { addDays, nightsBetween } from './time';

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

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
  if (!from || !to || !DATE_ONLY_RE.test(from) || !DATE_ONLY_RE.test(to) || to < from) {
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
