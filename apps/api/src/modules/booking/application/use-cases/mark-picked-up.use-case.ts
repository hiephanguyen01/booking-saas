import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import {
  BOOKING_REPOSITORY,
  type BookingRecord,
  type IBookingRepository,
} from '../../domain/ports/booking-repository.port';
import { loadOwnedBooking, type PartnerContext } from '../partner-owned-booking';
import { Booking } from '../../domain/entities/booking.entity';

/** Inventory pickup (§9.4). Partner-driven. */
@Injectable()
export class MarkPickedUpUseCase {
  constructor(
    @Inject(BOOKING_REPOSITORY) private readonly bookings: IBookingRepository,
    private readonly tenantDb: TenantDbService,
    private readonly outbox: OutboxService,
  ) {}

  execute(ctx: PartnerContext, bookingId: string): Promise<BookingRecord> {
    return this.tenantDb.forTenant(ctx.tenantId, async (tx) => {
      const booking = await loadOwnedBooking(this.bookings, tx, bookingId, ctx.partnerId);
      const aggregate = Booking.rehydrate(booking);
      aggregate.assertPickupAllowed();
      const updated = await this.bookings.patchFulfillment(
        tx,
        bookingId,
        {
          ...aggregate.fulfillment().planPickup(await this.tenantDb.databaseNow(tx)),
        },
        { expectedStatus: booking.status, unsetMarker: 'pickedUpAt' },
      );
      await this.outbox.emit(tx, {
        tenantId: ctx.tenantId,
        eventType: 'booking.picked_up',
        payload: { bookingId },
      });
      return updated;
    });
  }
}
