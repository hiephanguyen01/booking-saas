import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb, fakeTx } from '~testing';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import type {
  IListingRepository,
  ListingRecord,
} from '../../../listing/domain/ports/listing-repository.port';
import {
  BookingNotFound,
  BookingNotInventory,
  BookingStateChanged,
} from '../../domain/errors/booking-domain-errors';
import type {
  BookingRecord,
  IBookingRepository,
  TransitionParams,
} from '../../domain/ports/booking-repository.port';
import { MarkReturnedUseCase } from './mark-returned.use-case';

const TENANT_ID = 'tenant-1';
const PARTNER_ID = 'partner-1';
const BOOKING_ID = 'booking-1';
const LISTING_ID = 'listing-1';
const DUE = new Date('2026-09-10T12:00:00Z');
const DEPOSIT = 500_000n;

const booking = (overrides: Record<string, unknown> = {}): BookingRecord =>
  ({
    id: BOOKING_ID,
    code: 'BK-0001',
    partnerId: PARTNER_ID,
    listingId: LISTING_ID,
    status: 'confirmed',
    bookingMode: 'inventory',
    startUtc: new Date('2026-09-09T12:00:00Z'),
    endUtc: DUE,
    quantity: 2,
    finalAmount: 1_000_000n,
    paidAmount: 1_000_000n,
    securityDeposit: DEPOSIT,
    additionalCharges: [],
    ...overrides,
  }) as unknown as BookingRecord;

/** 50,000 ₫ per overdue day, per item. */
const listing = (): ListingRecord =>
  ({
    id: LISTING_ID,
    modeConfig: { inventory: { unit: 'day', lateFeePerUnit: '50000', basePrice: '300000' } },
  }) as unknown as ListingRecord;

function harness(
  record: BookingRecord | null,
  now: Date,
  listingRecord: ListingRecord | null = listing(),
) {
  const patches: Array<{ patch: unknown; opts: unknown }> = [];
  const transitions: TransitionParams[] = [];
  const events: Array<{ eventType: string; payload: Record<string, unknown> }> = [];
  const tx = fakeTx({
    outboxEvent: {
      create: (args: { data: { eventType: string; payload: Record<string, unknown> } }) => {
        events.push({ eventType: args.data.eventType, payload: args.data.payload });
        return Promise.resolve({});
      },
    },
  });
  const tenantDb = fakeTenantDb({ tx, now });
  const bookings = fakePort<IBookingRepository>({
    findById: () => Promise.resolve(record),
    patchFulfillment: (_tx, _id, patch, opts) => {
      patches.push({ patch, opts });
      return Promise.resolve(null as never);
    },
    applyTransition: (_tx, params) => {
      transitions.push(params);
      return Promise.resolve({ ...booking(), ...params } as unknown as BookingRecord);
    },
  });
  return {
    useCase: new MarkReturnedUseCase(
      bookings,
      fakePort<IListingRepository>({ findById: () => Promise.resolve(listingRecord) }),
      tenantDb.service,
      new OutboxService(),
    ),
    tenantDb,
    patches,
    transitions,
    events,
  };
}

const ctx = { tenantId: TENANT_ID, partnerId: PARTNER_ID, actorId: 'staff-1' };
const daysLate = (days: number) => new Date(DUE.getTime() + days * 86_400_000);

describe('MarkReturnedUseCase', () => {
  it('rejects an unknown booking', async () => {
    const { useCase } = harness(null, DUE);

    await expect(useCase.execute(ctx, BOOKING_ID, 0n)).rejects.toBeInstanceOf(BookingNotFound);
  });

  it("refuses another partner's booking", async () => {
    const { useCase, transitions } = harness(booking({ partnerId: 'partner-2' }), DUE);

    await expect(useCase.execute(ctx, BOOKING_ID, 0n)).rejects.toThrow();
    expect(transitions).toEqual([]);
  });

  it('refuses a return on a booking that is not inventory', async () => {
    const { useCase } = harness(booking({ bookingMode: 'hourly' }), DUE);

    await expect(useCase.execute(ctx, BOOKING_ID, 0n)).rejects.toBeInstanceOf(BookingNotInventory);
  });

  it('refuses a return on a booking that is no longer confirmed', async () => {
    const { useCase } = harness(booking({ status: 'completed' }), DUE);

    await expect(useCase.execute(ctx, BOOKING_ID, 0n)).rejects.toBeInstanceOf(BookingStateChanged);
  });

  it('returns the whole deposit on an undamaged, on-time return', async () => {
    const { useCase } = harness(booking(), DUE);

    const result = await useCase.execute(ctx, BOOKING_ID, 0n);

    expect(result).toMatchObject({ lateFee: 0n, depositRefund: DEPOSIT, depositShortfall: 0n });
  });

  it('charges the late fee per overdue day and per item', async () => {
    // 2 days late × 50,000 ₫ × 2 items = 200,000 ₫, taken out of the deposit.
    const { useCase } = harness(booking(), daysLate(2));

    const result = await useCase.execute(ctx, BOOKING_ID, 0n);

    expect(result).toMatchObject({ lateFee: 200_000n, depositRefund: 300_000n });
  });

  it('rounds a part-day overdue up to a whole billed day', async () => {
    const { useCase } = harness(booking(), new Date(DUE.getTime() + 60_000));

    expect((await useCase.execute(ctx, BOOKING_ID, 0n)).lateFee).toBe(100_000n);
  });

  it('takes damage out of the same deposit', async () => {
    const { useCase } = harness(booking(), DUE);

    const result = await useCase.execute(ctx, BOOKING_ID, 120_000n);

    expect(result).toMatchObject({ depositRefund: 380_000n, depositShortfall: 0n });
  });

  it('reports a shortfall when the charges exceed the deposit', async () => {
    // 400,000 damage + 200,000 late = 600,000 against a 500,000 deposit.
    const { useCase } = harness(booking(), daysLate(2));

    const result = await useCase.execute(ctx, BOOKING_ID, 400_000n);

    expect(result).toMatchObject({ depositRefund: 0n, depositShortfall: 100_000n });
  });

  it('charges nothing late when the listing configures no rate', async () => {
    const { useCase } = harness(booking(), daysLate(2), null);

    expect((await useCase.execute(ctx, BOOKING_ID, 0n)).lateFee).toBe(0n);
  });

  it('records the inspection against the status it loaded, then completes', async () => {
    // The fulfillment patch is a compare-and-set on the status read a moment ago,
    // so a concurrent transition cannot be overwritten.
    const { useCase, tenantDb, patches, transitions } = harness(booking(), daysLate(1));

    await useCase.execute(ctx, BOOKING_ID, 0n);

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(patches[0]).toEqual({
      patch: {
        returnedAt: daysLate(1),
        damageAmount: 0n,
        additionalCharges: [{ type: 'late_fee', amount: '100000' }],
      },
      opts: { expectedStatus: 'confirmed', unsetMarker: 'returnedAt' },
    });
    expect(transitions[0]).toMatchObject({
      to: 'completed',
      actor: 'partner',
      actorId: 'staff-1',
      reason: 'inventory returned',
    });
  });

  it('announces the return and the completion, in that order', async () => {
    // Finance settles on `booking.completed`; the refund handler needs the return
    // figures, so both events are emitted and the return comes first.
    const { useCase, events } = harness(booking(), daysLate(2));

    await useCase.execute(ctx, BOOKING_ID, 100_000n);

    expect(events).toEqual([
      {
        eventType: 'booking.returned',
        payload: {
          bookingId: BOOKING_ID,
          lateFee: '200000',
          depositRefund: '200000',
          depositShortfall: '0',
        },
      },
      { eventType: 'booking.completed', payload: { bookingId: BOOKING_ID } },
    ]);
  });
});
