export const AVAILABILITY_CACHE = Symbol('AVAILABILITY_CACHE');

/** A cached, priced hourly slot — the booking/config-derived portion only (§9.1). */
export interface CachedSlot {
  startUtc: string;
  endUtc: string;
  available: boolean;
  price: string;
}

/**
 * Cache for the booking/config-derived hourly slots of a `(listing, date)`
 * (§9.1: "Results are cached in Redis by (listing, date) for the booking/config
 * portion only"). Hold state is deliberately NOT cached — the read use case
 * merges live holds on top of whatever this returns.
 *
 * Availability is resource-scoped, so invalidation is by resource: one booking
 * or block change invalidates every listing on the resource.
 */
export interface IAvailabilityCache {
  get(listingId: string, date: string, selectionKey: string): Promise<CachedSlot[] | null>;
  set(
    resourceId: string,
    listingId: string,
    date: string,
    selectionKey: string,
    slots: CachedSlot[],
  ): Promise<void>;
  /** Drop every cached `(listing, date)` entry for a resource (all listings on it). */
  invalidateResource(resourceId: string): Promise<void>;
  /** Drop cached priced slots for one listing after a pricing-rule change. */
  invalidateListing(listingId: string): Promise<void>;
  /**
   * Invalidate by booking: booking outbox events carry only a `bookingId`, so the
   * booking's `resource_id` is resolved in-tenant before invalidating the resource.
   */
  invalidateByBooking(tenantId: string, bookingId: string): Promise<void>;
}
