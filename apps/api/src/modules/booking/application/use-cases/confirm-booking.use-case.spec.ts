import { describe, expect, it } from 'vitest';
import { fakeCollaborator, fakePort, fakeTenantDb, fakeTx } from '~testing';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import type { ReservePromotionUseCase } from '../../../promotions/application/use-cases/reserve-promotion.use-case';
import { PromoRejectionError } from '../../../promotions/domain/errors/promo-rejection-errors';
import { SlotTakenError } from '../../domain/booking-errors';
import { BookingNotFound } from '../../domain/errors/booking-domain-errors';
import type {
  BookingRecord,
  IBookingRepository,
  TransitionParams,
} from '../../domain/ports/booking-repository.port';
import { ConfirmBookingUseCase } from './confirm-booking.use-case';

const TENANT_ID = 'tenant-1';
const BOOKING_ID = 'booking-1';
const CODE = 'BK-0001';
const DEPOSIT = 400_000n;
const SECURITY_DEPOSIT = 100_000n;

/** Only the columns `planConfirmation` and the refund path read. */
function booking(overrides: Record<string, unknown> = {}): BookingRecord {
  return {
    id: BOOKING_ID,
    tenantId: TENANT_ID,
    code: CODE,
    customerId: 'customer-1',
    partnerId: 'partner-1',
    listingId: 'listing-1',
    status: 'pending_payment',
    bookingMode: 'daily',
    startUtc: new Date('2026-09-10T02:00:00Z'),
    endUtc: new Date('2026-09-11T02:00:00Z'),
    quantity: 1,
    finalAmount: 500_000n,
    discountAmount: 50_000n,
    depositAmount: DEPOSIT,
    paidAmount: 0n,
    securityDeposit: SECURITY_DEPOSIT,
    additionalCharges: [],
    cancellationPolicySnapshot: [],
    promotionId: null,
    ...overrides,
  } as unknown as BookingRecord;
}

interface Options {
  record?: BookingRecord | null;
  /** Thrown by `applyTransition` — the exclusion constraint surfaces there. */
  transitionError?: Error;
  reserveError?: Error;
  /** The record the auto-refund path re-reads in its own transaction. */
  secondRead?: BookingRecord | null;
}

interface Harness {
  readonly useCase: ConfirmBookingUseCase;
  readonly tenantDb: ReturnType<typeof fakeTenantDb>;
  readonly transitions: TransitionParams[];
  readonly reservations: unknown[];
  readonly events: Array<{ eventType: string; payload: Record<string, unknown> }>;
}

function harness(options: Options = {}): Harness {
  const transitions: TransitionParams[] = [];
  const reservations: unknown[] = [];
  const events: Array<{ eventType: string; payload: Record<string, unknown> }> = [];
  let reads = 0;

  const tx = fakeTx({
    outboxEvent: {
      create: (args: { data: { eventType: string; payload: Record<string, unknown> } }) => {
        events.push({ eventType: args.data.eventType, payload: args.data.payload });
        return Promise.resolve({});
      },
    },
  });
  const tenantDb = fakeTenantDb({ tx });

  const bookings = fakePort<IBookingRepository>({
    findById: () => {
      reads += 1;
      if (reads > 1 && options.secondRead !== undefined) return Promise.resolve(options.secondRead);
      return Promise.resolve(options.record === undefined ? booking() : options.record);
    },
    applyTransition: (_tx, params) => {
      transitions.push(params);
      if (options.transitionError) throw options.transitionError;
      return Promise.resolve({ ...booking(), ...params, code: CODE } as unknown as BookingRecord);
    },
  });
  const reservePromotion = fakeCollaborator<ReservePromotionUseCase>({
    execute: (_tx: unknown, _tenantId: unknown, data: unknown) => {
      reservations.push(data);
      if (options.reserveError) throw options.reserveError;
      return Promise.resolve();
    },
  });

  return {
    useCase: new ConfirmBookingUseCase(
      bookings,
      tenantDb.service,
      new OutboxService(),
      reservePromotion,
    ),
    tenantDb,
    transitions,
    reservations,
    events,
  };
}

describe('ConfirmBookingUseCase', () => {
  it('rejects an unknown booking', async () => {
    const { useCase } = harness({ record: null });

    await expect(useCase.execute(TENANT_ID, BOOKING_ID)).rejects.toBeInstanceOf(BookingNotFound);
  });

  it('confirms a paid booking and records the deposit as paid', async () => {
    const { useCase, tenantDb, transitions, events } = harness();

    await useCase.execute(TENANT_ID, BOOKING_ID);

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(transitions).toEqual([
      {
        id: BOOKING_ID,
        from: 'pending_payment',
        to: 'confirmed',
        actor: 'system',
        expiresAt: null,
        paidAmount: DEPOSIT,
      },
    ]);
    expect(events).toEqual([
      { eventType: 'booking.confirmed', payload: { bookingId: BOOKING_ID, code: CODE } },
    ]);
  });

  it.each(['confirmed', 'completed', 'no_show'])(
    'is a harmless no-op when the booking is already %s',
    async (status) => {
      // Outbox delivery is at-least-once: a Finance handler failing after this one
      // already confirmed means this runs again, and it must not transition twice.
      const { useCase, transitions, events } = harness({ record: booking({ status }) });

      await useCase.execute(TENANT_ID, BOOKING_ID);

      expect(transitions).toEqual([]);
      expect(events).toEqual([]);
    },
  );

  it('re-reserves the promotion on a late-webhook restore from expired', async () => {
    // The redemption was released at expiry, so the discount the customer already
    // received has to be accounted for again.
    const { useCase, reservations } = harness({
      record: booking({ status: 'expired', promotionId: 'promo-1' }),
    });

    await useCase.execute(TENANT_ID, BOOKING_ID);

    expect(reservations).toEqual([
      {
        promotionId: 'promo-1',
        bookingId: BOOKING_ID,
        customerId: 'customer-1',
        discountAmount: 50_000n,
        // The per-customer cap was already paid at booking time; re-blocking on it
        // would fail a confirm for money the customer has handed over.
        usageLimitPerCustomer: null,
      },
    ]);
  });

  it('does not re-reserve on an ordinary confirm — create-booking already claimed it', async () => {
    const { useCase, reservations } = harness({ record: booking({ promotionId: 'promo-1' }) });

    await useCase.execute(TENANT_ID, BOOKING_ID);

    expect(reservations).toEqual([]);
  });

  it('has nothing to re-reserve when the booking carried no promotion', async () => {
    const { useCase, reservations } = harness({ record: booking({ status: 'expired' }) });

    await useCase.execute(TENANT_ID, BOOKING_ID);

    expect(reservations).toEqual([]);
  });

  it('confirms anyway when the promotion is now exhausted', async () => {
    // A promo-bookkeeping edge must never fail a confirm for a paid booking; §8.2
    // accepts the temporary overshoot.
    const { useCase, events } = harness({
      record: booking({ status: 'expired', promotionId: 'promo-1' }),
      reserveError: new PromoRejectionError('PROMO_LIMIT_REACHED'),
    });

    await useCase.execute(TENANT_ID, BOOKING_ID);

    expect(events).toEqual([
      { eventType: 'booking.confirmed', payload: { bookingId: BOOKING_ID, code: CODE } },
    ]);
  });

  it('still fails on a promotion rejection that is not the usage limit', async () => {
    const { useCase } = harness({
      record: booking({ status: 'expired', promotionId: 'promo-1' }),
      reserveError: new PromoRejectionError('PROMO_NOT_FOUND'),
    });

    await expect(useCase.execute(TENANT_ID, BOOKING_ID)).rejects.toBeInstanceOf(
      PromoRejectionError,
    );
  });

  it('auto-refunds instead of 500ing when a late webhook finds the slot taken', async () => {
    const { useCase, tenantDb, events } = harness({
      record: booking({ status: 'expired' }),
      transitionError: new SlotTakenError(),
    });

    await useCase.execute(TENANT_ID, BOOKING_ID);

    // A second transaction: the confirm tx is poisoned by the exclusion violation.
    expect(tenantDb.openedFor).toEqual([TENANT_ID, TENANT_ID]);
    expect(events).toEqual([
      {
        eventType: 'booking.cancelled',
        payload: {
          bookingId: BOOKING_ID,
          code: CODE,
          // Checkout charged the service and the security deposit in one gateway
          // transaction; refunding only the service strands the customer's money.
          refundAmount: (DEPOSIT + SECURITY_DEPOSIT).toString(),
          refundPercent: 100,
        },
      },
    ]);
  });

  it('rejects the auto-refund when the booking vanished between the transactions', async () => {
    const { useCase } = harness({
      record: booking({ status: 'expired' }),
      transitionError: new SlotTakenError(),
      secondRead: null,
    });

    await expect(useCase.execute(TENANT_ID, BOOKING_ID)).rejects.toBeInstanceOf(BookingNotFound);
  });

  it('does not swallow a failure that is not a slot conflict', async () => {
    const { useCase } = harness({ transitionError: new Error('database is on fire') });

    await expect(useCase.execute(TENANT_ID, BOOKING_ID)).rejects.toThrow('database is on fire');
  });
});
