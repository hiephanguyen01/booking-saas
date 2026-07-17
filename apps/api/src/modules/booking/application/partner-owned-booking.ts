import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { PrismaTx } from '../../../shared/tenant-context/tenant-db.service';
import type { BookingRecord, IBookingRepository } from '../domain/ports/booking-repository.port';

/** The acting partner's scope for partner-side booking actions (§8.2). */
export interface PartnerContext {
  tenantId: string;
  partnerId: string;
  actorId: string;
}

/**
 * Load a booking and assert the acting partner owns it — 404 when it doesn't
 * exist, 403 when it belongs to another partner. Shared by every partner-side
 * booking write path so they all answer identically.
 */
export async function loadOwnedBooking(
  bookings: IBookingRepository,
  tx: PrismaTx,
  bookingId: string,
  partnerId: string,
): Promise<BookingRecord> {
  const booking = await bookings.findById(tx, bookingId);
  if (!booking) throw new NotFoundException({ statusCode: 404, code: 'BOOKING_NOT_FOUND', message: 'Booking not found' });
  if (booking.partnerId !== partnerId) {
    throw new ForbiddenException({ statusCode: 403, code: 'NOT_OWNED', message: 'Booking belongs to another partner' });
  }
  return booking;
}
