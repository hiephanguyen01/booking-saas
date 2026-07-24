import { Inject, Injectable } from '@nestjs/common';
import type { ModeConfig } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import {
  LISTING_REPOSITORY,
  type IListingRepository,
} from '../../../listing/domain/ports/listing-repository.port';
import {
  BOOKING_REPOSITORY,
  type BookingRecord,
  type IBookingRepository,
} from '../../domain/ports/booking-repository.port';
import { Booking } from '../../domain/entities/booking.entity';
import { loadOwnedBooking, type PartnerContext } from '../partner-owned-booking';

export interface ReturnResult {
  booking: BookingRecord;
  lateFee: bigint;
  depositRefund: bigint;
  depositShortfall: bigint;
}

/** Inventory return + inspection (§9.4). Partner-driven. */
@Injectable()
export class MarkReturnedUseCase {
  constructor(
    @Inject(BOOKING_REPOSITORY) private readonly bookings: IBookingRepository,
    @Inject(LISTING_REPOSITORY) private readonly listings: IListingRepository,
    private readonly tenantDb: TenantDbService,
    private readonly outbox: OutboxService,
  ) {}

  execute(ctx: PartnerContext, bookingId: string, damageAmount: bigint): Promise<ReturnResult> {
    return this.tenantDb.forTenant(ctx.tenantId, async (tx) => {
      const booking = await loadOwnedBooking(this.bookings, tx, bookingId, ctx.partnerId);
      const aggregate = Booking.rehydrate(booking);
      aggregate.assertReturnable(ctx.actorId);

      const returnedAt = await this.tenantDb.databaseNow(tx);
      const inventory = (
        (await this.listings.findById(tx, booking.listingId))?.modeConfig as ModeConfig | undefined
      )?.inventory;
      const {
        patch,
        completion,
        lateFee: fee,
        depositRefund: refund,
        depositShortfall: shortfall,
      } = aggregate.planReturn(returnedAt, damageAmount, inventory, ctx.actorId);

      const patched = await this.bookings.patchFulfillment(tx, bookingId, patch);
      const completed = await this.bookings.applyTransition(tx, {
        ...completion,
        // Preserve the legacy CAS source: patchFulfillment re-reads the row and
        // its observed status is what the immediately-following UPDATE guards.
        from: patched.status,
      });
      await this.outbox.emit(tx, {
        tenantId: ctx.tenantId,
        eventType: 'booking.returned',
        payload: {
          bookingId,
          lateFee: fee.toString(),
          depositRefund: refund.toString(),
          depositShortfall: shortfall.toString(),
        },
      });
      await this.outbox.emit(tx, {
        tenantId: ctx.tenantId,
        eventType: 'booking.completed',
        payload: { bookingId },
      });
      return {
        booking: completed,
        lateFee: fee,
        depositRefund: refund,
        depositShortfall: shortfall,
      };
    });
  }
}
