import type { BookingStatus } from '@booking/contracts';
import type { PrismaTx, TenantDbService } from '../../../shared/tenant-context/tenant-db.service';
import type { OutboxService } from '../../../shared/outbox/outbox.service';
import type { BookingRecord, IBookingRepository } from '../domain/ports/booking-repository.port';
import { Booking } from '../domain/entities/booking.entity';
import { loadOwnedBooking, type PartnerContext } from './partner-owned-booking';

export interface PartnerTransitionDeps {
  bookings: IBookingRepository;
  tenantDb: TenantDbService;
  outbox: OutboxService;
}

/**
 * The shared partner-side transition (§8.2): load + ownership check, assert the
 * state-machine edge for the `partner` actor, apply it, and emit the outbox
 * event — all inside ONE `forTenant` transaction. Shared by the approve /
 * reject / no-show use-cases; deps are passed in (plain function, no DI).
 */
export function applyPartnerTransition(
  deps: PartnerTransitionDeps,
  ctx: PartnerContext,
  bookingId: string,
  to: BookingStatus,
  eventType: string,
  opts: {
    expiresAt?: Date;
    reason?: string;
    guard?: (booking: BookingRecord, tx: PrismaTx) => void | Promise<void>;
    eventPayload?: (booking: BookingRecord) => Record<string, unknown>;
  },
): Promise<BookingRecord> {
  return deps.tenantDb.forTenant(ctx.tenantId, async (tx) => {
    const booking = await loadOwnedBooking(deps.bookings, tx, bookingId, ctx.partnerId);
    const aggregate = Booking.rehydrate(booking);
    const transition = aggregate.transitionTo(to, 'partner', {
      actorId: ctx.actorId,
      reason: opts.reason ?? null,
      expiresAt: opts.expiresAt,
    });
    await opts.guard?.(booking, tx);
    const updated = await deps.bookings.applyTransition(tx, transition);
    await deps.outbox.emit(tx, {
      tenantId: ctx.tenantId,
      eventType,
      payload: {
        ...opts.eventPayload?.(updated),
        bookingId,
        code: updated.code,
      },
    });
    return updated;
  });
}
