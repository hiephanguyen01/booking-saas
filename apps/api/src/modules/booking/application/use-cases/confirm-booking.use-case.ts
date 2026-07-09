import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { TenantDbService, type PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import { BOOKING_REPOSITORY, type BookingRecord, type IBookingRepository } from '../../domain/ports/booking-repository.port';
import { assertTransition } from '../../domain/booking-state-machine';

/**
 * Confirm a paid booking (§8.2 pending_payment → confirmed). Task 1.9's webhook
 * calls {@link confirmInTx} INSIDE the same tenant tx that flips the payment to
 * succeeded, so payment-succeeded and booking-confirmed commit atomically —
 * closing the race where the expiry sweep could expire an already-paid booking.
 */
@Injectable()
export class ConfirmBookingUseCase {
  constructor(
    @Inject(BOOKING_REPOSITORY) private readonly bookings: IBookingRepository,
    private readonly tenantDb: TenantDbService,
    private readonly outbox: OutboxService,
  ) {}

  execute(tenantId: string, bookingId: string): Promise<BookingRecord> {
    return this.tenantDb.forTenant(tenantId, (tx) => this.confirmInTx(tx, tenantId, bookingId));
  }

  /** Confirm within an existing tenant transaction (caller owns the tx). */
  async confirmInTx(tx: PrismaTx, tenantId: string, bookingId: string): Promise<BookingRecord> {
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
    await this.outbox.emit(tx, { tenantId, eventType: 'booking.confirmed', payload: { bookingId, code: confirmed.code } });
    return confirmed;
  }
}
