import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';

export const PROMO_CONTEXT_LOOKUP = Symbol('PROMO_CONTEXT_LOOKUP');

/** The scope fields + resource timezone a promotion is evaluated against. */
export interface ListingScope {
  listingId: string;
  listingTypeId: string;
  groupId: string | null;
  categoryId: string | null;
  partnerId: string;
  timezone: string;
}

export interface CustomerIdentity {
  customerId: string;
  email?: string | null;
  phone?: string | null;
}

/**
 * Read-only lookups the promotions module needs but that live in other bounded
 * contexts (catalog / booking). Exposed as a port so the module never imports
 * another module's service (§4.3). Implemented against Prisma within the caller's
 * tenant transaction — RLS scopes bookings to the current tenant.
 */
export interface IPromoContextLookup {
  /** Listing scope + its resource timezone; null when the listing is missing. */
  getListingScope(tx: PrismaTx, listingId: string): Promise<ListingScope | null>;
  /**
   * The customer's prior committed bookings in the tenant (for `first_booking_only`,
   * §12.2), matched by user id OR normalised email/phone to cover guest checkout (§8.6).
   */
  countPriorBookings(tx: PrismaTx, identity: CustomerIdentity): Promise<number>;
}
