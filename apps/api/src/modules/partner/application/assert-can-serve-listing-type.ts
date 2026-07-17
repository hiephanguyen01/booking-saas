import { ForbiddenException } from '@nestjs/common';
import {
  canServeListingType,
  type ListingTypeGate,
  type VerificationView,
} from '../domain/partner-verification';

/**
 * The reusable identity-verification gate (§7.3). Listing creation calls this
 * at listing-create time to block an unverified partner from a people-booking
 * listing type.
 *
 * Lives in the application layer (plain function, no DI) because it translates
 * the pure domain rule ({@link canServeListingType}) into an HTTP error — the
 * domain layer stays free of `@nestjs/*` imports.
 */
export function assertCanServeListingType(
  partner: VerificationView,
  listingType: ListingTypeGate,
): void {
  if (!canServeListingType(partner, listingType)) {
    throw new ForbiddenException({
      statusCode: 403,
      code: 'PARTNER_NOT_VERIFIED',
      message: 'Partner must complete identity verification to serve this listing type',
    });
  }
}
