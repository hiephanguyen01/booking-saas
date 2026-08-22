import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb, fakeTx } from '~testing';
import type { CommissionSnapshot } from '../../../../shared/domain/commission/commission-snapshot';
import type {
  AffiliateCommissionState,
  NewAffiliateCommission,
} from '../../domain/entities/affiliate-commission.entity';
import type { IAffiliateCommissionRepository } from '../../domain/ports/affiliate-commission-repository.port';
import { RecordPendingCommissionUseCase } from './record-pending-commission.use-case';

const TENANT_ID = 'tenant-1';
const BOOKING_ID = 'booking-1';
const AFFILIATE_ID = 'affiliate-1';

/** 10% affiliate on a VAT-free basis, so the maths stays legible in the test. */
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

interface Options {
  booking?: BookingRow | null;
  existing?: AffiliateCommissionState | null;
  partnerIsHouse?: boolean;
}

function harness(options: Options = {}) {
  const upserts: NewAffiliateCommission[] = [];
  const tx = fakeTx({
    booking: {
      findUnique: () =>
        Promise.resolve(options.booking === undefined ? booking() : options.booking),
    },
    partner: {
      findUnique: () => Promise.resolve({ isHouse: options.partnerIsHouse ?? false }),
    },
  });
  const tenantDb = fakeTenantDb({ tx });
  return {
    useCase: new RecordPendingCommissionUseCase(
      fakePort<IAffiliateCommissionRepository>({
        loadByBooking: () => Promise.resolve(options.existing ?? null),
        upsert: (_tx, commission) => {
          upserts.push(commission);
          return Promise.resolve();
        },
      }),
      tenantDb.service,
    ),
    tenantDb,
    upserts,
  };
}

const stored = (
  overrides: Partial<AffiliateCommissionState> = {},
): AffiliateCommissionState => ({
  id: 'commission-1',
  tenantId: TENANT_ID,
  affiliateId: AFFILIATE_ID,
  bookingId: BOOKING_ID,
  amount: 0n,
  status: 'pending',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  ...overrides,
});

describe('RecordPendingCommissionUseCase', () => {
  it('does nothing for a booking with no affiliate', async () => {
    const { useCase, upserts } = harness({ booking: booking({ affiliateId: null }) });

    await useCase.execute(TENANT_ID, BOOKING_ID);

    expect(upserts).toEqual([]);
  });

  it('does nothing for a booking that no longer exists', async () => {
    const { useCase, upserts } = harness({ booking: null });

    await useCase.execute(TENANT_ID, BOOKING_ID);

    expect(upserts).toEqual([]);
  });

  it('replays the amount from the booking’s FROZEN snapshot', async () => {
    // The commission must equal its ledger leg exactly; re-deriving a rate here
    // is how the two drift apart.
    const { useCase, upserts, tenantDb } = harness();

    await useCase.execute(TENANT_ID, BOOKING_ID);

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(upserts).toEqual([
      {
        tenantId: TENANT_ID,
        affiliateId: AFFILIATE_ID,
        bookingId: BOOKING_ID,
        amount: 100_000n,
        status: 'pending',
      },
    ]);
  });

  it('ignores additional charges at confirmation time', async () => {
    // They are added before completion; a pending commission is on the booking
    // as confirmed, not as it may end up.
    const { useCase, upserts } = harness({
      booking: booking({ additionalCharges: [{ amount: 500_000 }] }),
    });

    await useCase.execute(TENANT_ID, BOOKING_ID);

    expect(upserts[0]?.amount).toBe(100_000n);
  });

  it('RECOMPUTES an existing pending row on a redelivery', async () => {
    // At-least-once delivery means the same event can arrive twice, possibly
    // after the booking's amounts changed.
    const { useCase, upserts } = harness({ existing: stored({ amount: 1n }) });

    await useCase.execute(TENANT_ID, BOOKING_ID);

    expect(upserts).toEqual([
      {
        tenantId: TENANT_ID,
        affiliateId: AFFILIATE_ID,
        bookingId: BOOKING_ID,
        amount: 100_000n,
        status: 'pending',
      },
    ]);
  });

  it('LEAVES a terminal row alone', async () => {
    // A reversed or clawed-back commission must not be resurrected by a
    // redelivered confirmation.
    for (const status of ['confirmed', 'paid', 'reversed', 'clawed_back'] as const) {
      const { useCase, upserts } = harness({ existing: stored({ status }) });

      await useCase.execute(TENANT_ID, BOOKING_ID);

      expect(upserts).toEqual([]);
    }
  });

  it('falls back to a ZERO-commission snapshot when the booking has none', async () => {
    // A booking predating the snapshot must not be charged a guessed rate.
    const { useCase, upserts } = harness({ booking: booking({ commissionSnapshot: null }) });

    await useCase.execute(TENANT_ID, BOOKING_ID);

    expect(upserts[0]?.amount).toBe(0n);
  });

  it('bites on what the customer PAID, whoever funded the discount', async () => {
    // The affiliate leg always applies to final_amount. Promo funding shifts
    // the PARTNER basis, not this one — so the same discounted booking yields
    // the same affiliate commission either way.
    const tenantFunded = harness({
      booking: booking({
        discountAmount: 200_000n,
        finalAmount: 800_000n,
        promotionSnapshot: { fundedBy: 'tenant' },
      }),
    });
    const partnerFunded = harness({
      booking: booking({
        discountAmount: 200_000n,
        finalAmount: 800_000n,
        promotionSnapshot: { fundedBy: 'partner' },
      }),
    });

    await tenantFunded.useCase.execute(TENANT_ID, BOOKING_ID);
    await partnerFunded.useCase.execute(TENANT_ID, BOOKING_ID);

    expect(tenantFunded.upserts[0]?.amount).toBe(80_000n);
    expect(partnerFunded.upserts[0]?.amount).toBe(80_000n);
  });

  it('reads the funding only when a discount was actually applied', async () => {
    // A promo snapshot with no discount behind it must not shift any basis.
    const { useCase, upserts } = harness({
      booking: booking({ discountAmount: 0n, promotionSnapshot: { fundedBy: 'tenant' } }),
    });

    await useCase.execute(TENANT_ID, BOOKING_ID);

    expect(upserts[0]?.amount).toBe(100_000n);
  });
});
