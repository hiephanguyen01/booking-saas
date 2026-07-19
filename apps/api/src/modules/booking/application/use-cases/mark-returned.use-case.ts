import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { ModeConfig } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { vnd } from '../../../../shared/money/money';
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
import { assertTransition } from '../../domain/booking-state-machine';
import { lateFee, overduePeriods } from '../../domain/late-fee';
import { settleDeposit } from '../../domain/deposit-settlement';
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
      if (booking.bookingMode !== 'inventory') {
        throw new BadRequestException({
          statusCode: 400,
          code: 'NOT_INVENTORY',
          message: 'Return applies to inventory rentals only',
        });
      }
      assertTransition(booking.status, 'completed', 'partner');

      const returnedAt = await this.tenantDb.databaseNow(tx);
      const inventory = (
        (await this.listings.findById(tx, booking.listingId))?.modeConfig as ModeConfig | undefined
      )?.inventory;
      const unit = inventory?.unit ?? 'day';
      const ratePerUnit = vnd(inventory?.lateFeePerUnit ?? inventory?.basePrice ?? '0');
      const fee = lateFee(
        overduePeriods(returnedAt, booking.endUtc, unit),
        ratePerUnit,
        booking.quantity,
      );
      const { refund, shortfall } = settleDeposit(booking.securityDeposit, damageAmount, fee);

      const additionalCharges = fee > 0n ? [{ type: 'late_fee', amount: fee.toString() }] : [];
      const patched = await this.bookings.patchFulfillment(tx, bookingId, {
        returnedAt,
        damageAmount,
        ...(additionalCharges.length > 0 ? { additionalCharges } : {}),
      });
      const completed = await this.bookings.applyTransition(tx, {
        id: bookingId,
        from: patched.status,
        to: 'completed',
        actor: 'partner',
        actorId: ctx.actorId,
        reason: 'inventory returned',
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
