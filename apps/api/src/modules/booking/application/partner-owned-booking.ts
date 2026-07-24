import type { PrismaTx } from '../../../shared/tenant-context/tenant-db.service';
import type { BookingRecord, IBookingRepository } from '../domain/ports/booking-repository.port';
import { Booking } from '../domain/entities/booking.entity';
import { BookingNotFound } from '../domain/errors/booking-domain-errors';

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
  if (!booking) throw new BookingNotFound();
  Booking.rehydrate(booking).assertOwnedBy(partnerId);
  return booking;
}
