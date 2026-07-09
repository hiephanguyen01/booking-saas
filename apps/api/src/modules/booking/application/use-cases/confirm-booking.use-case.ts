import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import { BOOKING_REPOSITORY, type BookingRecord, type IBookingRepository } from '../../domain/ports/booking-repository.port';
import { assertTransition } from '../../domain/booking-state-machine';

/**
 * Confirm a paid booking (§8.2 pending_payment → confirmed). The integration
 * point Task 1.9's payment webhook calls; in Phase 1 the deposit is marked paid.
 */
@Injectable()
export class ConfirmBookingUseCase {
  constructor(
    @Inject(BOOKING_REPOSITORY) private readonly bookings: IBookingRepository,
    private readonly tenantDb: TenantDbService,
    private readonly outbox: OutboxService,
  ) {}

  async execute(tenantId: string, bookingId: string): Promise<BookingRecord> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const booking = await this.bookings.findById(tx, bookingId);
      if (!booking) throw new NotFoundException({ statusCode: 404, code: 'BOOKING_NOT_FOUND', message: 'Booking not found' });
      assertTransition(booking.status, 'confirmed', 'system');

      const confirmed = await this.bookings.applyTransition(tx, {
        id: bookingId,
        from: booking.status,
        to: 'confirmed',
        actor: 'system',
        expiresAt: null,
        paidAmount: booking.depositAmount,
      });
      await this.outbox.emit(tx, {
        tenantId,
        eventType: 'booking.confirmed',
        payload: { bookingId, code: confirmed.code },
      });
      return confirmed;
    });
  }
}
