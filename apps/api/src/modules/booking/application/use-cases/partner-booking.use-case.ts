import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { BookingStatus } from '@booking/contracts';
import { TenantDbService, type PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import { addMinutes, utcNow } from '../../../../shared/time/time';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import { BOOKING_REPOSITORY, type BookingRecord, type IBookingRepository } from '../../domain/ports/booking-repository.port';
import { assertTransition } from '../../domain/booking-state-machine';
import { isWithinNoShowWindow, NO_SHOW_WINDOW_HOURS } from '../../domain/no-show-window';

export interface PartnerContext {
  tenantId: string;
  partnerId: string;
  actorId: string;
}

/** Partner-side booking actions (§8.2): approve, reject, mark no-show. */
@Injectable()
export class PartnerBookingUseCase {
  constructor(
    @Inject(BOOKING_REPOSITORY) private readonly bookings: IBookingRepository,
    private readonly tenantDb: TenantDbService,
    private readonly outbox: OutboxService,
  ) {}

  approve(ctx: PartnerContext, bookingId: string): Promise<BookingRecord> {
    return this.act(ctx, bookingId, 'pending_payment', 'booking.approved', {
      expiresAt: addMinutes(utcNow(), 15),
    });
  }

  reject(ctx: PartnerContext, bookingId: string, reason?: string): Promise<BookingRecord> {
    return this.act(ctx, bookingId, 'rejected', 'booking.rejected', { reason });
  }

  markNoShow(ctx: PartnerContext, bookingId: string, reason?: string): Promise<BookingRecord> {
    return this.act(ctx, bookingId, 'no_show', 'booking.no_show', {
      reason,
      // §8.5: a no-show is only markable after the slot ends and within 48h of it.
      guard: (booking) => this.assertNoShowWindow(booking),
    });
  }

  /**
   * §8.5: the partner may mark `no_show` only once the slot has ended and only
   * within {@link NO_SHOW_WINDOW_HOURS}h of `timeslot.end` — past that a job has
   * (or is about to) auto-complete the booking, so a late mark would race it.
   */
  private assertNoShowWindow(booking: BookingRecord): void {
    if (!isWithinNoShowWindow(booking.endUtc, utcNow())) {
      throw new UnprocessableEntityException({
        statusCode: 422,
        code: 'NO_SHOW_WINDOW_INVALID',
        message: `A booking can only be marked no-show after it ends and within ${NO_SHOW_WINDOW_HOURS}h of the end time`,
      });
    }
  }

  private act(
    ctx: PartnerContext,
    bookingId: string,
    to: BookingStatus,
    eventType: string,
    opts: { expiresAt?: Date; reason?: string; guard?: (booking: BookingRecord) => void },
  ): Promise<BookingRecord> {
    return this.tenantDb.forTenant(ctx.tenantId, async (tx) => {
      const booking = await this.load(tx, bookingId, ctx.partnerId);
      assertTransition(booking.status, to, 'partner');
      opts.guard?.(booking);
      const updated = await this.bookings.applyTransition(tx, {
        id: bookingId,
        from: booking.status,
        to,
        actor: 'partner',
        actorId: ctx.actorId,
        reason: opts.reason ?? null,
        expiresAt: opts.expiresAt,
      });
      await this.outbox.emit(tx, { tenantId: ctx.tenantId, eventType, payload: { bookingId, code: updated.code } });
      return updated;
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
