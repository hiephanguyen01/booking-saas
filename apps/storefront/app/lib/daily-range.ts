import { addDays, nightsBetween } from './time';

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidDateOnly(value: string): boolean {
  if (!DATE_ONLY_RE.test(value)) return false;

  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

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
