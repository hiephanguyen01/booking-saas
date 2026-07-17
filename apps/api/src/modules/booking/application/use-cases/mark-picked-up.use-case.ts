import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { utcNow } from '../../../../shared/time/time';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import { BOOKING_REPOSITORY, type BookingRecord, type IBookingRepository } from '../../domain/ports/booking-repository.port';
import { loadOwnedBooking, type PartnerContext } from '../partner-owned-booking';

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
      if (booking.status !== 'confirmed') {
        throw new BadRequestException({ statusCode: 400, code: 'NOT_CONFIRMED', message: 'Only a confirmed rental can be picked up' });
      }
      const updated = await this.bookings.patchFulfillment(tx, bookingId, { pickedUpAt: utcNow() });
      await this.outbox.emit(tx, { tenantId: ctx.tenantId, eventType: 'booking.picked_up', payload: { bookingId } });
      return updated;
    });
  }
}
