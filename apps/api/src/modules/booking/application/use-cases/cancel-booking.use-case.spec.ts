import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb, fakeTx } from '~testing';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import type { TransitionActor } from '../../domain/booking-state-machine';
import { BookingNotFound } from '../../domain/errors/booking-domain-errors';
import type {
  BookingRecord,
  IBookingRepository,
  TransitionParams,
} from '../../domain/ports/booking-repository.port';
import { CancelBookingUseCase } from './cancel-booking.use-case';

const TENANT_ID = 'tenant-1';
const BOOKING_ID = 'booking-1';
const CODE = 'BK-0001';
const PAID = 1_000_000n;
const DEPOSIT_HELD = 200_000n;

/** 24h+ before start → 100%, 2h+ → 50%, anything later → 0%. */
const POLICY = [
  { hoursBefore: 24, refundPercent: 100 },
  { hoursBefore: 2, refundPercent: 50 },
];

const START = new Date('2026-09-10T10:00:00Z');

/**
 * Only the fields this use case and the `Booking` aggregate read. `BookingRecord`
 * carries sixty-odd joined columns that none of them touch, so spelling them all
 * out would hide which ones actually drive the settlement.
 */
function booking(overrides: Record<string, unknown> = {}): BookingRecord {
  return {
    id: BOOKING_ID,
    tenantId: TENANT_ID,
    code: CODE,
    partnerId: 'partner-1',
    listingId: 'listing-1',
    customerId: 'customer-1',
    status: 'confirmed',
    bookingMode: 'hourly',
    startUtc: START,
    endUtc: new Date('2026-09-10T12:00:00Z'),
    quantity: 1,
    finalAmount: PAID,
    discountAmount: 0n,
    depositAmount: PAID,
    paidAmount: PAID,
    securityDeposit: DEPOSIT_HELD,
    additionalCharges: [],
    cancellationPolicySnapshot: POLICY,
    promotionId: null,
    ...overrides,
  } as unknown as BookingRecord;
}

interface Harness {
  readonly useCase: CancelBookingUseCase;
  readonly tenantDb: ReturnType<typeof fakeTenantDb>;
  readonly transitions: TransitionParams[];
  readonly events: Array<{ eventType: string; payload: Record<string, unknown> }>;
}

function harness(record: BookingRecord | null, now: Date): Harness {
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
    applyTransition: (_tx, params) => {
      transitions.push(params);
      return Promise.resolve({ ...booking(), ...params, code: CODE } as unknown as BookingRecord);
    },
  });

  return {
    useCase: new CancelBookingUseCase(bookings, tenantDb.service, new OutboxService()),
    tenantDb,
    transitions,
    events,
  };
}

/** `now` such that the cancellation lands `hours` before the start. */
const hoursBeforeStart = (hours: number): Date => new Date(START.getTime() - hours * 3_600_000);

describe('CancelBookingUseCase', () => {
  it('rejects an unknown booking', async () => {
    const { useCase } = harness(null, hoursBeforeStart(48));

    await expect(useCase.execute(TENANT_ID, BOOKING_ID, 'customer')).rejects.toBeInstanceOf(
      BookingNotFound,
    );
  });

  it('refunds a customer in full outside the first tier', async () => {
    const { useCase } = harness(booking(), hoursBeforeStart(48));

    const result = await useCase.execute(TENANT_ID, BOOKING_ID, 'customer');

    expect(result.refundPercent).toBe(100);
    expect(result.refundAmount).toBe(PAID + DEPOSIT_HELD);
  });

  it('applies the tier the customer actually falls into', async () => {
    const { useCase } = harness(booking(), hoursBeforeStart(6));

    const result = await useCase.execute(TENANT_ID, BOOKING_ID, 'customer');

    expect(result.refundPercent).toBe(50);
    expect(result.refundAmount).toBe(PAID / 2n + DEPOSIT_HELD);
  });

  it('treats a tier boundary as inclusive', async () => {
    const { useCase } = harness(booking(), hoursBeforeStart(24));

    expect((await useCase.execute(TENANT_ID, BOOKING_ID, 'customer')).refundPercent).toBe(100);
  });

  it('refunds a late customer cancellation nothing — but still returns the deposit held', async () => {
    // The security deposit is the customer's own money held against damage, not
    // part of the price. A 0% cancellation must still hand it back.
    const { useCase } = harness(booking(), hoursBeforeStart(1));

    const result = await useCase.execute(TENANT_ID, BOOKING_ID, 'customer');

    expect(result.refundPercent).toBe(0);
    expect(result.refundAmount).toBe(DEPOSIT_HELD);
  });

  it.each<TransitionActor>(['partner', 'tenant'])(
    'refunds a %s cancellation in full however late it is',
    async (actor) => {
      // The customer did nothing wrong, so the policy tiers do not apply — not
      // even one minute before the start.
      const { useCase } = harness(booking(), hoursBeforeStart(1 / 60));

      const result = await useCase.execute(TENANT_ID, BOOKING_ID, actor);

      expect(result.refundPercent).toBe(100);
      expect(result.refundAmount).toBe(PAID + DEPOSIT_HELD);
    },
  );

  it('reads the tier from the DATABASE clock, not the app host clock', async () => {
    // Two runs differing only in the Postgres clock must land on different tiers;
    // if the use case reached for `new Date()` both would answer the same.
    const early = harness(booking(), hoursBeforeStart(48));
    const late = harness(booking(), hoursBeforeStart(6));

    expect((await early.useCase.execute(TENANT_ID, BOOKING_ID, 'customer')).refundPercent).toBe(
      100,
    );
    expect((await late.useCase.execute(TENANT_ID, BOOKING_ID, 'customer')).refundPercent).toBe(50);
  });

  it('records the settlement on the transition it writes', async () => {
    const { useCase, transitions } = harness(booking(), hoursBeforeStart(6));

    await useCase.execute(TENANT_ID, BOOKING_ID, 'customer', {
      actorId: 'user-9',
      reason: 'đổi lịch',
    });

    expect(transitions).toEqual([
      {
        id: BOOKING_ID,
        from: 'confirmed',
        to: 'cancelled',
        actor: 'customer',
        actorId: 'user-9',
        reason: 'đổi lịch',
        refundDueAmount: PAID / 2n + DEPOSIT_HELD,
        refundPercent: 50,
      },
    ]);
  });

  it('announces the cancellation in the same transaction, money as a string', async () => {
    const { useCase, tenantDb, events } = harness(booking(), hoursBeforeStart(48));

    await useCase.execute(TENANT_ID, BOOKING_ID, 'customer');

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(events).toEqual([
      {
        eventType: 'booking.cancelled',
        payload: {
          bookingId: BOOKING_ID,
          code: CODE,
          refundAmount: (PAID + DEPOSIT_HELD).toString(),
          refundPercent: 100,
        },
      },
    ]);
  });

  it('refuses to cancel a booking that is already cancelled', async () => {
    const { useCase, events } = harness(booking({ status: 'cancelled' }), hoursBeforeStart(48));

    await expect(useCase.execute(TENANT_ID, BOOKING_ID, 'customer')).rejects.toThrow();
    expect(events).toEqual([]);
  });

  it('returns a conflict when a refunded booking is cancelled again', async () => {
    const { useCase, events } = harness(booking({ status: 'refunded' }), hoursBeforeStart(48));

    await expect(useCase.execute(TENANT_ID, BOOKING_ID, 'customer')).rejects.toMatchObject({
      code: 'INVALID_TRANSITION',
      httpStatus: 409,
    });
    expect(events).toEqual([]);
  });

  it('returns forbidden when an actor cannot perform the transition', async () => {
    const { useCase, events } = harness(booking(), hoursBeforeStart(48));

    await expect(useCase.execute(TENANT_ID, BOOKING_ID, 'system')).rejects.toMatchObject({
      code: 'FORBIDDEN_ACTOR',
      httpStatus: 403,
    });
    expect(events).toEqual([]);
  });

  it('refunds nothing when the booking carries no policy snapshot', async () => {
    // An empty snapshot means no tier ever matches, which the policy helper reads
    // as 0% rather than as "unrestricted".
    const { useCase } = harness(booking({ cancellationPolicySnapshot: [] }), hoursBeforeStart(48));

    expect((await useCase.execute(TENANT_ID, BOOKING_ID, 'customer')).refundPercent).toBe(0);
  });
});
