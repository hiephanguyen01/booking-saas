import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type { Interval } from '../availability/interval';

export const BUSY_READER = Symbol('BUSY_READER');

/**
 * Reads busy intervals by resource (§9.1) — always by resource, never listing,
 * so shared calendars are respected. Bookings contribute their buffered
 * `blocked_period`; holds contribute their raw `timeslot` (never cached).
 */
export interface IBusyReader {
  /** Active bookings' blocked_period overlapping `[from,to)` (exclusive statuses/modes). */
  busyBookings(tx: PrismaTx, resourceId: string, fromUtc: Date, toUtc: Date): Promise<Interval[]>;
  /** Unexpired holds overlapping `[from,to)`. */
  activeHolds(tx: PrismaTx, resourceId: string, fromUtc: Date, toUtc: Date): Promise<Interval[]>;
}
