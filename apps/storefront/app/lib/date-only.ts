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

/**
 * Whether shifting a valid date by the requested number of days still produces
 * a four-digit YYYY-MM-DD value. This rejects boundary inputs such as
 * 9999-12-31 before callers invoke date arithmetic that would yield an extended
 * ISO year outside the storefront/API date-only contract.
 */
export function canOffsetDateOnly(value: string, days: number): boolean {
  if (!isValidDateOnly(value) || !Number.isInteger(days)) return false;
  const shiftedMs = Date.parse(`${value}T00:00:00Z`) + days * 86_400_000;
  if (!Number.isFinite(shiftedMs)) return false;

  const shifted = new Date(shiftedMs).toISOString().slice(0, 10);
  return isValidDateOnly(shifted);
}
