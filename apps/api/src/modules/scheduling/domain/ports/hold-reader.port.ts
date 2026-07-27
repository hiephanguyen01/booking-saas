import type { Interval } from '../../../../shared/domain/availability/interval';

export const HOLD_READER = Symbol('HOLD_READER');

/**
 * Reads live slot holds (§10 Layer 1) for a resource. Holds are authored by the
 * booking module into Redis (the `booking_holds` Postgres table is only a mirror,
 * never the source of truth), so availability reads them straight from Redis and
 * merges them at read time — expired holds are already gone, so no ghost slots.
 */
export interface IHoldReader {
  /** Unexpired holds overlapping `[fromUtc, toUtc)`, by resource. */
  activeHolds(resourceId: string, fromUtc: Date, toUtc: Date): Promise<Interval[]>;
}
