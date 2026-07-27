import { ServiceUnavailableException } from '@nestjs/common';

/**
 * The grant store returned nothing where its port promises an issued grant.
 *
 * `IssueBookingAccessGrantUseCase` only yields null when the caller passed
 * `optional`, so on the OTP-exchange path this is a contract violation by the
 * adapter rather than an expected outcome. It is a 5xx (a named Nest exception,
 * not a `DomainError`, which is 4xx-only) so the guest is told to retry instead
 * of receiving a response whose `accessGrant` field cannot be filled.
 */
export class BookingAccessGrantUnavailable extends ServiceUnavailableException {
  constructor() {
    super({
      code: 'BOOKING_ACCESS_GRANT_UNAVAILABLE',
      message: 'Could not issue a booking access grant; please try again',
    });
  }
}
