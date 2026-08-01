import type { DayStatus } from '@booking/contracts';
import type { UnitPrice } from '../pricing/quote-calculator';
import { overlapsAny, type Interval } from './interval';

export interface DayAvailabilityInput {
  /** Open windows for the date (empty = no rule / closed exception). */
  openWindows: readonly Interval[];
  /** True when a `closed` exception shuts the date. */
  closedByException: boolean;
  /** The night's `[check-in, check-out)` interval, or null when there is no open window. */
  night: Interval | null;
  /** Busy intervals by resource (daily bookings' blocked_period). */
  busy: readonly Interval[];
  /** The night's priced quote, or null when the date is not open. */
  price: UnitPrice | null;
}

export interface ComputedDay {
  status: DayStatus;
  price: UnitPrice | null;
}

/**
 * Daily-mode day status (§9.2): `blocked` when an exception closed it, `closed`
 * when no rule opens it, `booked` when a daily booking covers the night, else
 * `available`. Price is shown for bookable/booked days.
 */
export function computeDay(input: DayAvailabilityInput): ComputedDay {
  if (input.closedByException) return { status: 'blocked', price: null };
  if (input.openWindows.length === 0 || !input.night) return { status: 'closed', price: null };
  if (overlapsAny(input.night, input.busy)) return { status: 'booked', price: input.price };
  return { status: 'available', price: input.price };
}
