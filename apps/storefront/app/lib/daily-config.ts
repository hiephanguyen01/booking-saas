import { timeOfDaySchema } from '@booking/contracts';

/**
 * The daily-mode settings a listing carries in the untyped `modeConfig.daily` jsonb.
 *
 * Four call sites used to re-read this blob inline — two on the server with zod
 * validation, two on the client with a bare cast — and they disagreed on what a
 * missing bound meant. This is the single reading; the defaults below are the
 * contract, not a per-call-site guess.
 */
export interface DailyModeConfig {
  /** Wall-clock `HH:MM` in the resource timezone. */
  checkinTime: string;
  checkoutTime: string;
  minNights: number;
  /** `null` means unbounded — an absent, zero or malformed `maxNights` sets no ceiling. */
  maxNights: number | null;
}

const DEFAULT_CHECKIN_TIME = '14:00';
const DEFAULT_CHECKOUT_TIME = '12:00';

/** Reads `modeConfig.daily`, falling back to the platform defaults field by field. */
export function dailyModeConfig(modeConfig: Record<string, unknown>): DailyModeConfig {
  const raw = (modeConfig.daily ?? {}) as Record<string, unknown>;
  return {
    checkinTime: timeOfDay(raw.checkinTime, DEFAULT_CHECKIN_TIME),
    checkoutTime: timeOfDay(raw.checkoutTime, DEFAULT_CHECKOUT_TIME),
    minNights: positiveNumber(raw.minNights) ?? 1,
    maxNights: positiveNumber(raw.maxNights),
  };
}

function timeOfDay(value: unknown, fallback: string): string {
  const parsed = timeOfDaySchema.safeParse(value);
  return parsed.success ? parsed.data : fallback;
}

function positiveNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}
