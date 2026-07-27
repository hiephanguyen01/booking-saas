import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  BOOKING_ACCESS_GRANT_STORE,
  type BookingAccessGrantScope,
  type IBookingAccessGrantStore,
  type IssuedBookingAccessGrant,
} from '../../domain/ports/booking-access-grant-store.port';

/**
 * Issue a short-lived guest access grant for a booking (§8.6).
 *
 * The two callers need different failure policies, so the policy lives here
 * rather than in the controller:
 *
 * - default (OTP exchange): obtaining the grant IS the request, so a store
 *   outage must surface — the error propagates.
 * - `optional` (right after checkout): the booking is already created and paid
 *   for. Losing the grant only costs the guest the convenience link — they can
 *   still reach the booking through the OTP flow — so failing the checkout
 *   response over it would be strictly worse. Logged, returns null.
 */
@Injectable()
export class IssueBookingAccessGrantUseCase {
  private readonly logger = new Logger(IssueBookingAccessGrantUseCase.name);

  constructor(
    @Inject(BOOKING_ACCESS_GRANT_STORE)
    private readonly grants: IBookingAccessGrantStore,
  ) {}

  /** Null only when `optional` is set — otherwise the store's error propagates. */
  async execute(
    scope: BookingAccessGrantScope,
    opts: { optional?: boolean } = {},
  ): Promise<IssuedBookingAccessGrant | null> {
    try {
      return await this.grants.issue(scope);
    } catch (error) {
      if (!opts.optional) throw error;
      this.logger.warn(`booking access grant unavailable for booking ${scope.bookingId}`);
      return null;
    }
  }
}
