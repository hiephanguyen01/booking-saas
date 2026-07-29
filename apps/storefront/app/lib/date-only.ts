import { dateOnlySchema } from '@booking/contracts';

/**
 * Validates a calendar date encoded as YYYY-MM-DD, through the contract that
 * defines the shape — regex alone is insufficient because values such as
 * 2026-02-31 match it.
 */
export function isValidDateOnly(value: string): boolean {
  return dateOnlySchema.safeParse(value).success;
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
