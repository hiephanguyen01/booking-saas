import { Inject, Injectable } from '@nestjs/common';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  BOOKING_REPOSITORY,
  type BookingRecord,
  type IBookingRepository,
} from '../../domain/ports/booking-repository.port';
import { Booking } from '../../domain/entities/booking.entity';
import { loadOwnedBooking, type PartnerContext } from '../partner-owned-booking';

/** Partner confirmation that a non-inventory service finished and cash was collected on site. */
@Injectable()
export class MarkCompletedUseCase {
  constructor(
    @Inject(BOOKING_REPOSITORY) private readonly bookings: IBookingRepository,
    private readonly tenantDb: TenantDbService,
    private readonly outbox: OutboxService,
  ) {}

  execute(
    ctx: PartnerContext,
    bookingId: string,
    onsiteCollectedAmount: bigint,
    note?: string,
  ): Promise<BookingRecord> {
    return this.tenantDb.forTenant(ctx.tenantId, async (tx) => {
      const booking = await loadOwnedBooking(this.bookings, tx, bookingId, ctx.partnerId);
      const aggregate = Booking.rehydrate(booking);
      aggregate.assertNonInventoryCompletion();
      const transition = aggregate.planCompletion(
        await this.tenantDb.databaseNow(tx),
        onsiteCollectedAmount,
        ctx.actorId,
        note,
      );
      const completed = await this.bookings.applyTransition(tx, transition);
      await this.outbox.emit(tx, {
        tenantId: ctx.tenantId,
        eventType: 'booking.completed',
        payload: { bookingId, onsiteCollectedAmount: onsiteCollectedAmount.toString() },
      });
      return completed;
    });
  }
}
