export const HOLD_STORE = Symbol('HOLD_STORE');

/**
 * Slot hold (§10 Layer 1) — a resource-scoped, time-range-overlap-checked
 * reservation with a TTL, so two customers can't race to checkout the same slot.
 * The Postgres exclusion constraint remains the hard Layer-2 guarantee.
 */
export interface IHoldStore {
  /**
   * Atomically reserve `[startUtc, endUtc)` (buffer already applied) on a
   * resource. Returns a holdId on success, or null if it overlaps a live hold.
   */
  acquire(resourceId: string, startUtc: Date, endUtc: Date): Promise<string | null>;
  release(resourceId: string, holdId: string): Promise<void>;
}
