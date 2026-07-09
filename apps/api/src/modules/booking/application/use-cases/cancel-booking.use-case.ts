import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { utcNow } from '../../../../shared/time/time';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import { BOOKING_REPOSITORY, type BookingRecord, type IBookingRepository } from '../../domain/ports/booking-repository.port';
import { assertTransition, type TransitionActor } from '../../domain/booking-state-machine';
import {
  computeRefund,
  hoursUntil,
  refundPercent,
  type CancellationTier,
} from '../../domain/cancellation-policy';

export interface CancelResult {
  booking: BookingRecord;
  refundAmount: bigint;
  refundPercent: number;
}

/**
 * Cancel a confirmed booking (§8.2/§11.3). A **customer** cancel refunds per the
 * snapshotted policy; a **partner/tenant** cancel is always a 100% refund. The
 * refund amount is computed here; execution (gateway) is Task 1.9.
 */
@Injectable()
export class CancelBookingUseCase {
  constructor(
    @Inject(BOOKING_REPOSITORY) private readonly bookings: IBookingRepository,
    private readonly tenantDb: TenantDbService,
    private readonly outbox: OutboxService,
  ) {}

  async execute(
    tenantId: string,
    bookingId: string,
    actor: TransitionActor,
    opts: { actorId?: string; reason?: string } = {},
  ): Promise<CancelResult> {
    const result = await this.tenantDb.forTenant(tenantId, async (tx) => {
      const booking = await this.bookings.findById(tx, bookingId);
      if (!booking) throw new NotFoundException({ statusCode: 404, code: 'BOOKING_NOT_FOUND', message: 'Booking not found' });
      assertTransition(booking.status, 'cancelled', actor);

      const percent =
        actor === 'customer'
          ? refundPercent(
              (booking.cancellationPolicySnapshot ?? []) as CancellationTier[],
              hoursUntil(booking.startUtc, utcNow()),
            )
          : 100; // partner/tenant cancellation is always full refund
      // The refundable security deposit is ALWAYS returned in full on cancellation
      // (no rental happened) — the cancellation policy only bites the paid deposit (§9.4).
      const refundAmount = computeRefund(booking.paidAmount, percent) + booking.securityDeposit;

      const cancelled = await this.bookings.applyTransition(tx, {
        id: bookingId,
        from: booking.status,
        to: 'cancelled',
        actor,
        actorId: opts.actorId ?? null,
        reason: opts.reason ?? null,
      });
      await this.outbox.emit(tx, {
        tenantId,
        eventType: 'booking.cancelled',
        payload: { bookingId, code: cancelled.code, refundAmount: refundAmount.toString(), refundPercent: percent },
      });
      return { booking: cancelled, refundAmount, refundPercent: percent };
    });
    // The slot frees itself because the booking left the exclusion set; any Redis
    // hold expires by TTL.
    return result;
  }
}
