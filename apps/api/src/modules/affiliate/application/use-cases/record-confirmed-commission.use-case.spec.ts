import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb, fakeTx } from '~testing';
import type { CommissionSnapshot } from '../../../../shared/domain/commission/commission-snapshot';
import type {
  AffiliateCommissionState,
  NewAffiliateCommission,
} from '../../domain/entities/affiliate-commission.entity';
import type { IAffiliateCommissionRepository } from '../../domain/ports/affiliate-commission-repository.port';
import { RecordConfirmedCommissionUseCase } from './record-confirmed-commission.use-case';

const TENANT_ID = 'tenant-1';
const BOOKING_ID = 'booking-1';
const AFFILIATE_ID = 'affiliate-1';

const SNAPSHOT: CommissionSnapshot = {
  ruleId: 'rule-1',
  appliesTo: 'tenant_default',
  tenantRateType: 'percent',
  tenantRate: '20',
  platformRate: 0,
  affiliateRateType: 'percent',
  affiliateRate: '10',
  isHouse: false,
};

interface BookingRow {
  affiliateId: string | null;
  partnerId: string;
  totalAmount: bigint;
  finalAmount: bigint;
  additionalCharges: unknown;
  commissionSnapshot: unknown;
  promotionSnapshot: unknown;
  discountAmount: bigint;
}

const booking = (overrides: Partial<BookingRow> = {}): BookingRow => ({
  affiliateId: AFFILIATE_ID,
  partnerId: 'partner-1',
  totalAmount: 1_000_000n,
  finalAmount: 1_000_000n,
  additionalCharges: [],
  commissionSnapshot: SNAPSHOT,
  promotionSnapshot: null,
  discountAmount: 0n,
  ...overrides,
});

const stored = (
  overrides: Partial<AffiliateCommissionState> = {},
): AffiliateCommissionState => ({
  id: 'commission-1',
  tenantId: TENANT_ID,
  affiliateId: AFFILIATE_ID,
  bookingId: BOOKING_ID,
  amount: 100_000n,
  status: 'pending',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  ...overrides,
});

function harness(options: { booking?: BookingRow | null; existing?: AffiliateCommissionState | null } = {}) {
  const upserts: NewAffiliateCommission[] = [];
  const tx = fakeTx({
    booking: {
      findUnique: () =>
        Promise.resolve(options.booking === undefined ? booking() : options.booking),
    },
    partner: { findUnique: () => Promise.resolve({ isHouse: false }) },
  });
  const tenantDb = fakeTenantDb({ tx });
  return {
    useCase: new RecordConfirmedCommissionUseCase(
      fakePort<IAffiliateCommissionRepository>({
        loadByBooking: () => Promise.resolve(options.existing ?? null),
        upsert: (_tx, commission) => {
          upserts.push(commission);
          return Promise.resolve();
        },
      }),
      tenantDb.service,
    ),
    upserts,
  };
}

describe('RecordConfirmedCommissionUseCase', () => {
  it('does nothing for a booking with no affiliate', async () => {
    const { useCase, upserts } = harness({ booking: booking({ affiliateId: null }) });

    await useCase.execute(TENANT_ID, BOOKING_ID);

    expect(upserts).toEqual([]);
  });

  it('INCLUDES additional charges, unlike the pending calculation', async () => {
    // Completion is what the customer finally owed, extras and all.
    const { useCase, upserts } = harness({
      booking: booking({ additionalCharges: [{ amount: 500_000 }] }),
    });

    await useCase.execute(TENANT_ID, BOOKING_ID);

    expect(upserts).toEqual([
      {
        tenantId: TENANT_ID,
        affiliateId: AFFILIATE_ID,
        bookingId: BOOKING_ID,
        amount: 150_000n,
        status: 'confirmed',
      },
    ]);
  });

  it('sums charges from legacy json shapes and ignores junk', async () => {
    // The column has carried numbers, digit strings and bigints over time.
    const { useCase, upserts } = harness({
      booking: booking({
        additionalCharges: [
          { amount: 100_000 },
          { amount: '200000' },
          { amount: 200_000n },
          { amount: 'not-a-number' },
          {},
        ],
      }),
    });

    await useCase.execute(TENANT_ID, BOOKING_ID);

    expect(upserts[0]?.amount).toBe(150_000n);
  });

  it('CLAMPS a net-negative charge total to zero', async () => {
    // A refund line must not shrink the commission below the booking itself.
    const { useCase, upserts } = harness({
      booking: booking({ additionalCharges: [{ amount: -500_000 }] }),
    });

    await useCase.execute(TENANT_ID, BOOKING_ID);

    expect(upserts[0]?.amount).toBe(100_000n);
  });

  it('CONFIRMS an existing pending row', async () => {
    const { useCase, upserts } = harness({ existing: stored({ status: 'pending' }) });

    await useCase.execute(TENANT_ID, BOOKING_ID);

    expect(upserts[0]).toMatchObject({ status: 'confirmed', amount: 100_000n });
  });

  it('re-confirms an already-confirmed row, in case the amounts moved', async () => {
    const { useCase, upserts } = harness({
      existing: stored({ status: 'confirmed', amount: 1n }),
    });

    await useCase.execute(TENANT_ID, BOOKING_ID);

    expect(upserts[0]).toMatchObject({ status: 'confirmed', amount: 100_000n });
  });

  it('LEAVES a terminal row alone', async () => {
    // A completion redelivered after a refund must not un-claw the commission.
    for (const status of ['paid', 'reversed', 'clawed_back'] as const) {
      const { useCase, upserts } = harness({ existing: stored({ status }) });

      await useCase.execute(TENANT_ID, BOOKING_ID);

      expect(upserts).toEqual([]);
    }
  });

  it('opens a confirmed row when completion arrives before confirmation', async () => {
    const { useCase, upserts } = harness({ existing: null });

    await useCase.execute(TENANT_ID, BOOKING_ID);

    expect(upserts[0]).toMatchObject({ status: 'confirmed' });
  });
});
