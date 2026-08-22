import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb, fakeTx } from '~testing';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import { BookingNotConfirmed, BookingNotFound } from '../../domain/errors/booking-domain-errors';
import type { BookingRecord, IBookingRepository } from '../../domain/ports/booking-repository.port';
import { MarkPickedUpUseCase } from './mark-picked-up.use-case';

const TENANT_ID = 'tenant-1';
const PARTNER_ID = 'partner-1';
const BOOKING_ID = 'booking-1';
const NOW = new Date('2026-09-10T09:00:00Z');

const booking = (overrides: Record<string, unknown> = {}): BookingRecord =>
  ({
    id: BOOKING_ID,
    code: 'BK-0001',
    partnerId: PARTNER_ID,
    status: 'confirmed',
    bookingMode: 'inventory',
    endUtc: new Date('2026-09-11T09:00:00Z'),
    quantity: 1,
    securityDeposit: 100_000n,
    ...overrides,
  }) as unknown as BookingRecord;

function harness(record: BookingRecord | null) {
  const patches: Array<{ patch: unknown; opts: unknown }> = [];
  const events: Array<{ eventType: string; payload: Record<string, unknown> }> = [];
  const tx = fakeTx({
    outboxEvent: {
      create: (args: { data: { eventType: string; payload: Record<string, unknown> } }) => {
        events.push({ eventType: args.data.eventType, payload: args.data.payload });
        return Promise.resolve({});
      },
    },
  });
  const tenantDb = fakeTenantDb({ tx, now: NOW });
  return {
    useCase: new MarkPickedUpUseCase(
      fakePort<IBookingRepository>({
        findById: () => Promise.resolve(record),
        patchFulfillment: (_tx, _id, patch, opts) => {
          patches.push({ patch, opts });
          return Promise.resolve(booking());
        },
      }),
      tenantDb.service,
      new OutboxService(),
    ),
    tenantDb,
    patches,
    events,
  };
}

const ctx = { tenantId: TENANT_ID, partnerId: PARTNER_ID, actorId: 'staff-1' };

describe('MarkPickedUpUseCase', () => {
  it('rejects an unknown booking', async () => {
    const { useCase } = harness(null);

    await expect(useCase.execute(ctx, BOOKING_ID)).rejects.toBeInstanceOf(BookingNotFound);
  });

  it("refuses another partner's booking", async () => {
    const { useCase, patches } = harness(booking({ partnerId: 'partner-2' }));

    await expect(useCase.execute(ctx, BOOKING_ID)).rejects.toThrow();
    expect(patches).toEqual([]);
  });

  it('refuses a pickup on a booking that is not confirmed, before reading the clock', async () => {
    // Handing the item over before the money is in is exactly what the deposit
    // exists to prevent.
    //
    // `planPickup` re-checks the status and would also throw, so the earlier
    // `assertPickupAllowed()` looks redundant — it is not. It keeps a rejected
    // request from costing a `databaseNow` round-trip first, which is why the
    // clock read is asserted here rather than just the absent patch.
    const { useCase, tenantDb, patches } = harness(booking({ status: 'pending_payment' }));

    await expect(useCase.execute(ctx, BOOKING_ID)).rejects.toBeInstanceOf(BookingNotConfirmed);
    expect(patches).toEqual([]);
    expect(tenantDb.clockReads()).toBe(0);
  });

  it('stamps the pickup from the database clock, against the status it read', async () => {
    const { useCase, tenantDb, patches, events } = harness(booking());

    await useCase.execute(ctx, BOOKING_ID);

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(patches[0]).toEqual({
      patch: { pickedUpAt: NOW },
      opts: { expectedStatus: 'confirmed', unsetMarker: 'pickedUpAt' },
    });
    expect(events).toEqual([
      { eventType: 'booking.picked_up', payload: { bookingId: BOOKING_ID } },
    ]);
  });
});
