import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  BOOKING_REPOSITORY,
  type BookingRecord,
  type IBookingRepository,
} from '../../domain/ports/booking-repository.port';

/**
 * Set or clear the partner's private operational note on one of their own
 * bookings (§8.2, `bookings.partner_note`).
 *
 * A blank/omitted note clears the column. Not an outbox event: the note is a
 * local annotation no other bounded context reacts to.
 */
@Injectable()
export class UpdatePartnerNoteUseCase {
  constructor(
    @Inject(BOOKING_REPOSITORY) private readonly bookings: IBookingRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  execute(
    ctx: { tenantId: string; partnerId: string },
    bookingId: string,
    note: string | null,
  ): Promise<BookingRecord> {
    return this.tenantDb.forTenant(ctx.tenantId, async (tx) => {
      const booking = await this.bookings.findById(tx, bookingId);
      if (!booking) {
        throw new NotFoundException({
          statusCode: 404,
          code: 'BOOKING_NOT_FOUND',
          message: 'Booking not found',
        });
      }
      // Matches the 403 the other partner write paths return (loadOwnedBooking).
      if (booking.partnerId !== ctx.partnerId) {
        throw new ForbiddenException({
          statusCode: 403,
          code: 'NOT_OWNED',
          message: 'Booking belongs to another partner',
        });
      }
      return this.bookings.updatePartnerNote(tx, bookingId, note);
    });
  }
}
