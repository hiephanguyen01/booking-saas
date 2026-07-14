import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { ModeConfig } from '@booking/contracts';
import { TenantDbService, type PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import { utcNow } from '../../../../shared/time/time';
import { vnd } from '../../../../shared/money/money';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import { LISTING_REPOSITORY, type IListingRepository } from '../../../listing/domain/ports/listing-repository.port';
import { BOOKING_REPOSITORY, type BookingRecord, type IBookingRepository } from '../../domain/ports/booking-repository.port';
import { assertTransition } from '../../domain/booking-state-machine';
import { lateFee, overduePeriods } from '../../domain/late-fee';
import { settleDeposit } from '../../domain/deposit-settlement';
import type { PartnerContext } from './partner-booking.use-case';

export interface ReturnResult {
  booking: BookingRecord;
  lateFee: bigint;
  depositRefund: bigint;
  depositShortfall: bigint;
}

/** Inventory pickup + return/inspection (§9.4). Partner-driven. */
@Injectable()
export class InventoryFulfillmentUseCase {
  constructor(
    @Inject(BOOKING_REPOSITORY) private readonly bookings: IBookingRepository,
    @Inject(LISTING_REPOSITORY) private readonly listings: IListingRepository,
    private readonly tenantDb: TenantDbService,
    private readonly outbox: OutboxService,
  ) {}

  markPickedUp(ctx: PartnerContext, bookingId: string): Promise<BookingRecord> {
    return this.tenantDb.forTenant(ctx.tenantId, async (tx) => {
      const booking = await this.load(tx, bookingId, ctx.partnerId);
      if (booking.status !== 'confirmed') {
        throw new BadRequestException({ statusCode: 400, code: 'NOT_CONFIRMED', message: 'Only a confirmed rental can be picked up' });
      }
      const updated = await this.bookings.patchFulfillment(tx, bookingId, { pickedUpAt: utcNow() });
      await this.outbox.emit(tx, { tenantId: ctx.tenantId, eventType: 'booking.picked_up', payload: { bookingId } });
      return updated;
    });
  }

  markReturned(ctx: PartnerContext, bookingId: string, damageAmount: bigint): Promise<ReturnResult> {
    return this.tenantDb.forTenant(ctx.tenantId, async (tx) => {
      const booking = await this.load(tx, bookingId, ctx.partnerId);
      if (booking.bookingMode !== 'inventory') {
        throw new BadRequestException({ statusCode: 400, code: 'NOT_INVENTORY', message: 'Return applies to inventory rentals only' });
      }
      assertTransition(booking.status, 'completed', 'system'); // partner-triggered system completion

      const returnedAt = utcNow();
      const inventory = ((await this.listings.findById(tx, booking.listingId))?.modeConfig as ModeConfig | undefined)?.inventory;
      const unit = inventory?.unit ?? 'day';
      const ratePerUnit = vnd(inventory?.lateFeePerUnit ?? inventory?.basePrice ?? '0');
      const fee = lateFee(overduePeriods(returnedAt, booking.endUtc, unit), ratePerUnit, booking.quantity);
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
        actor: 'system',
        actorId: ctx.actorId,
        reason: 'inventory returned',
      });
      await this.outbox.emit(tx, {
        tenantId: ctx.tenantId,
        eventType: 'booking.returned',
        payload: { bookingId, lateFee: fee.toString(), depositRefund: refund.toString(), depositShortfall: shortfall.toString() },
      });
      await this.outbox.emit(tx, { tenantId: ctx.tenantId, eventType: 'booking.completed', payload: { bookingId } });
      return { booking: completed, lateFee: fee, depositRefund: refund, depositShortfall: shortfall };
    });
  }

  private async load(tx: PrismaTx, bookingId: string, partnerId: string): Promise<BookingRecord> {
    const booking = await this.bookings.findById(tx, bookingId);
    if (!booking) throw new NotFoundException({ statusCode: 404, code: 'BOOKING_NOT_FOUND', message: 'Booking not found' });
    if (booking.partnerId !== partnerId) {
      throw new ForbiddenException({ statusCode: 403, code: 'NOT_OWNED', message: 'Booking belongs to another partner' });
    }
    return booking;
  }
}
