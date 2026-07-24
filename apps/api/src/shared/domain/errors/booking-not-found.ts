import { DomainError } from '../domain-error';

/**
 * Shared wire error for the `BOOKING_NOT_FOUND` code — payments (checkout) is
 * the first migrator; booking (#14) and finance (#15) migrate their own
 * call-sites onto this class later (style-gate 2026-07-23 §3).
 */
export class BookingNotFound extends DomainError {
  constructor() {
    super('BOOKING_NOT_FOUND', 404, 'Booking not found');
  }
}
