export const BOOKING_ACCESS_GRANT_STORE = Symbol('BOOKING_ACCESS_GRANT_STORE');

export interface BookingAccessGrantScope {
  tenantId: string;
  bookingId: string;
  bookingCode: string;
}

export interface IssuedBookingAccessGrant {
  token: string;
  expiresInSec: number;
}

/** Short-lived guest access after a one-time OTP exchange or guest checkout. */
export interface IBookingAccessGrantStore {
  issue(scope: BookingAccessGrantScope): Promise<IssuedBookingAccessGrant>;
  verify(scope: BookingAccessGrantScope, token: string): Promise<boolean>;
  revoke(token: string): Promise<void>;
}
