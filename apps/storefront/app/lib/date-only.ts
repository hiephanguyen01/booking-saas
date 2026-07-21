const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validates a calendar date encoded as YYYY-MM-DD.
 * Regex alone is insufficient because values such as 2026-02-31 match the shape.
 */
export function isValidDateOnly(value: string): boolean {
  if (!DATE_ONLY_RE.test(value)) return false;

  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
