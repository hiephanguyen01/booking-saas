import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { BookingStatus } from '@booking/shared';
import { TenantDbService, type PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import { addMinutes, utcNow } from '../../../../shared/time/time';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import { BOOKING_REPOSITORY, type BookingRecord, type IBookingRepository } from '../../domain/ports/booking-repository.port';
import { assertTransition } from '../../domain/booking-state-machine';

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
    return this.act(ctx, bookingId, 'no_show', 'booking.no_show', { reason });
  }

  private act(
    ctx: PartnerContext,
    bookingId: string,
    to: BookingStatus,
    eventType: string,
    opts: { expiresAt?: Date; reason?: string },
  ): Promise<BookingRecord> {
    return this.tenantDb.forTenant(ctx.tenantId, async (tx) => {
      const booking = await this.load(tx, bookingId, ctx.partnerId);
      assertTransition(booking.status, to, 'partner');
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
