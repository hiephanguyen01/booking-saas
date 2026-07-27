import type { Interval } from '../../../../shared/domain/availability/interval';

export const HOLD_READER = Symbol('HOLD_READER');

/**
 * Batch-reads live slot holds (§10 Layer 1) for the searched resources. Holds are
 * authored by the booking module into Redis; catalog search only reads them at
 * evaluation time so a held slot never surfaces as bookable in the results.
 */
export interface IHoldReader {
  /** Unexpired holds overlapping `[fromUtc, toUtc)`, grouped by resource id. */
  activeHoldsByResource(
    resourceIds: string[],
    fromUtc: Date,
    toUtc: Date,
  ): Promise<Map<string, Interval[]>>;
}
