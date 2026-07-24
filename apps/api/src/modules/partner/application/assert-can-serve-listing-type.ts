import { Partner } from '../domain/entities/partner.entity';
import type { ListingTypeGate, VerificationView } from '../domain/partner-verification';

/**
 * The reusable identity-verification gate (§7.3). Listing creation calls this
 * at listing-create time to block an unverified partner from a people-booking
 * listing type.
 *
 * The frozen application-layer seam remains a plain function for Listing while
 * the entity owns the policy and its byte-compatible typed domain error.
 */
export function assertCanServeListingType(
  partner: VerificationView,
  listingType: ListingTypeGate,
): void {
  Partner.assertCanServeListingType(partner, listingType);
}
