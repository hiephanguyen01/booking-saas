import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import {
  BOOKING_REPOSITORY,
  type IBookingRepository,
} from '../../domain/ports/booking-repository.port';
import { assertTransition } from '../../domain/booking-state-machine';

/** `refund.completed` makes the booking status match actual money movement. */
@Injectable()
export class FinalizeRefundedBookingUseCase {
  constructor(
    @Inject(BOOKING_REPOSITORY) private readonly bookings: IBookingRepository,
    private readonly tenantDb: TenantDbService,
    private readonly outbox: OutboxService,
  ) {}

  async execute(tenantId: string, bookingId: string): Promise<void> {
    await this.tenantDb.forTenant(tenantId, async (tx) => {
      const booking = await this.bookings.findById(tx, bookingId);
      if (!booking || booking.status === 'refunded') return;
      assertTransition(booking.status, 'refunded', 'system');
      await this.bookings.applyTransition(tx, {
        id: bookingId,
        from: booking.status,
        to: 'refunded',
        actor: 'system',
        reason: 'refund transfer confirmed',
      });
      await this.outbox.emit(tx, {
        tenantId,
        eventType: 'booking.refunded',
        payload: { bookingId },
      });
    });
  }
}
