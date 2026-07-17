import type { BookingStatus } from '@booking/contracts';
import type { TenantDbService } from '../../../shared/tenant-context/tenant-db.service';
import type { OutboxService } from '../../../shared/outbox/outbox.service';
import type { BookingRecord, IBookingRepository } from '../domain/ports/booking-repository.port';
import { assertTransition } from '../domain/booking-state-machine';
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
  opts: { expiresAt?: Date; reason?: string; guard?: (booking: BookingRecord) => void },
): Promise<BookingRecord> {
  return deps.tenantDb.forTenant(ctx.tenantId, async (tx) => {
    const booking = await loadOwnedBooking(deps.bookings, tx, bookingId, ctx.partnerId);
    assertTransition(booking.status, to, 'partner');
    opts.guard?.(booking);
    const updated = await deps.bookings.applyTransition(tx, {
      id: bookingId,
      from: booking.status,
      to,
      actor: 'partner',
      actorId: ctx.actorId,
      reason: opts.reason ?? null,
      expiresAt: opts.expiresAt,
    });
    await deps.outbox.emit(tx, { tenantId: ctx.tenantId, eventType, payload: { bookingId, code: updated.code } });
    return updated;
  });
}
