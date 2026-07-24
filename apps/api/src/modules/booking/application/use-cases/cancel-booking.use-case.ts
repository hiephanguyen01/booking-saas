import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import {
  BOOKING_REPOSITORY,
  type BookingRecord,
  type IBookingRepository,
} from '../../domain/ports/booking-repository.port';
import type { TransitionActor } from '../../domain/booking-state-machine';
import { Booking } from '../../domain/entities/booking.entity';
import { BookingNotFound } from '../../domain/errors/booking-domain-errors';

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
      if (!booking) throw new BookingNotFound();
      const aggregate = Booking.rehydrate(booking);
      const transition = aggregate.transitionTo('cancelled', actor, {
        actorId: opts.actorId ?? null,
        reason: opts.reason ?? null,
      });
      const { refundAmount, refundPercent: percent } = aggregate.cancellationSettlement(
        actor,
        actor === 'customer' ? await this.tenantDb.databaseNow(tx) : booking.startUtc,
      );

      const cancelled = await this.bookings.applyTransition(tx, {
        ...transition,
        refundDueAmount: refundAmount,
        refundPercent: percent,
      });
      await this.outbox.emit(tx, {
        tenantId,
        eventType: 'booking.cancelled',
        payload: {
          bookingId,
          code: cancelled.code,
          refundAmount: refundAmount.toString(),
          refundPercent: percent,
        },
      });
      return { booking: cancelled, refundAmount, refundPercent: percent };
    });
    // The slot frees itself because the booking left the exclusion set; any Redis
    // hold expires by TTL.
    return result;
  }
}
