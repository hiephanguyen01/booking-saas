import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { utcNow } from '../../../../shared/time/time';
import {
  BOOKING_REPOSITORY,
  type BookingRecord,
  type IBookingRepository,
} from '../../domain/ports/booking-repository.port';
import { assertTransition } from '../../domain/booking-state-machine';
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
      if (booking.bookingMode === 'inventory') {
        throw new BadRequestException({
          statusCode: 400,
          code: 'INVENTORY_REQUIRES_RETURN',
          message: 'Inventory bookings are completed through the return workflow',
        });
      }
      if (utcNow() < booking.endUtc) {
        throw new ConflictException({
          statusCode: 409,
          code: 'SERVICE_NOT_ENDED',
          message: 'A booking can only be completed after its scheduled end time',
        });
      }
      assertTransition(booking.status, 'completed', 'partner');

      const charges = sumCharges(booking.additionalCharges);
      const effectiveFinal = booking.finalAmount + charges;
      // `paidAmount` stores only the service deposit. The refundable security
      // deposit is tracked separately in `securityDeposit`, even though checkout
      // charges both in one gateway payment. Subtracting it here would make the
      // partner over-report cash collected on site.
      const onlineAppliedToService = booking.paidAmount;
      const expectedOnsite =
        effectiveFinal > onlineAppliedToService ? effectiveFinal - onlineAppliedToService : 0n;
      if (onsiteCollectedAmount !== expectedOnsite) {
        throw new ConflictException({
          statusCode: 409,
          code: 'ONSITE_AMOUNT_MISMATCH',
          message: `On-site amount ${onsiteCollectedAmount} does not match the outstanding ${expectedOnsite}`,
          details: {
            expectedOnsiteAmount: expectedOnsite.toString(),
            reportedOnsiteAmount: onsiteCollectedAmount.toString(),
          },
        });
      }

      const completed = await this.bookings.applyTransition(tx, {
        id: bookingId,
        from: booking.status,
        to: 'completed',
        actor: 'partner',
        actorId: ctx.actorId,
        reason: note?.trim() || 'partner confirmed service completion',
      });
      await this.outbox.emit(tx, {
        tenantId: ctx.tenantId,
        eventType: 'booking.completed',
        payload: { bookingId, onsiteCollectedAmount: onsiteCollectedAmount.toString() },
      });
      return completed;
    });
  }
}

function sumCharges(raw: unknown): bigint {
  if (!Array.isArray(raw)) return 0n;
  return raw.reduce<bigint>((total, item) => {
    const amount = (item as { amount?: unknown })?.amount;
    if (typeof amount === 'string' && /^\d+$/.test(amount)) return total + BigInt(amount);
    if (typeof amount === 'number' && Number.isSafeInteger(amount) && amount > 0)
      return total + BigInt(amount);
    return total;
  }, 0n);
}
