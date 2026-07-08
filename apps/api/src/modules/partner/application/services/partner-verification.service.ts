import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  canServeListingType,
  type ListingTypeGate,
  type VerificationView,
} from '../../domain/partner-verification';

/**
 * The reusable identity-verification gate (§7.3). Task 1.4 calls this at
 * listing-create time to block an unverified partner from a people-booking
 * listing type; exported by PartnerModule for that reason.
 */
@Injectable()
export class PartnerVerificationService {
  assertCanServeListingType(partner: VerificationView, listingType: ListingTypeGate): void {
    if (!canServeListingType(partner, listingType)) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'PARTNER_NOT_VERIFIED',
        message: 'Partner must complete identity verification to serve this listing type',
      });
    }
  }
}
