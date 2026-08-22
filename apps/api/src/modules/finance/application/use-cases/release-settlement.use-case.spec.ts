import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb, fakeTx } from '~testing';
import { defaultCommissionSnapshot } from '../../../../shared/domain/commission/commission-snapshot';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import {
  FinanceBookingNotFound,
  SettlementJournalExists,
  SettlementNotFound,
  SettlementNotReleasable,
} from '../../domain/errors/finance-domain-errors';
import type { ILedgerRepository } from '../../domain/ports/ledger-repository.port';
import type {
  ISettlementRepository,
  SettlementRecord,
} from '../../domain/ports/settlement-repository.port';
import { ReleaseSettlementUseCase } from './release-settlement.use-case';

const TENANT_ID = 'tenant-1';
const SETTLEMENT_ID = 'settlement-1';
const BOOKING_ID = 'booking-1';
const PARTNER_ID = 'partner-1';
const HELD = 500_000n;
const SERVICE_DATE = new Date('2026-08-10T02:00:00Z');

const settlement = (overrides: Partial<SettlementRecord> = {}): SettlementRecord =>
  ({
    id: SETTLEMENT_ID,
    tenantId: TENANT_ID,
    bookingId: BOOKING_ID,
    paymentId: 'payment-1',
    partnerId: PARTNER_ID,
    status: 'dispute_window',
    kind: 'service_completed',
    onlineHeldAmount: HELD,
    onsiteCollectedAmount: 0n,
    refundedAmount: 0n,
    retainedAmount: 0n,
    ...overrides,
  }) as unknown as SettlementRecord;

interface Options {
  record?: SettlementRecord | null;
  entries?: Array<{ journalId: string; entryType: string }>;
  isHouse?: boolean;
  bookingMissing?: boolean;
  released?: boolean;
}

function harness(options: Options = {}) {
  const journals: Array<{ meta: Record<string, unknown> }> = [];
  const releases: unknown[] = [];
  const events: Array<{ eventType: string; payload: Record<string, unknown> }> = [];

  const tx = fakeTx({
    outboxEvent: {
      create: (args: { data: { eventType: string; payload: Record<string, unknown> } }) => {
        events.push({ eventType: args.data.eventType, payload: args.data.payload });
        return Promise.resolve({});
      },
    },
    booking: {
      findUnique: () =>
        Promise.resolve(
          options.bookingMissing
            ? null
            : {
                id: BOOKING_ID,
                partnerId: PARTNER_ID,
                affiliateId: null,
                totalAmount: HELD,
                finalAmount: HELD,
                paidAmount: HELD,
                additionalCharges: [],
                commissionSnapshot: defaultCommissionSnapshot(
                  options.isHouse ?? false,
                  SERVICE_DATE,
                ),
                promotionSnapshot: null,
                discountAmount: 0n,
              },
        ),
    },
    $queryRaw: () => Promise.resolve([{ serviceDate: SERVICE_DATE }]),
  });
  const tenantDb = fakeTenantDb({ tx });

  const useCase = new ReleaseSettlementUseCase(
    fakePort<ISettlementRepository>({
      findById: () => Promise.resolve(options.record === undefined ? settlement() : options.record),
      markReleased: (_tx, _id, _journalId, amounts) => {
        releases.push(amounts);
        return Promise.resolve((options.released ?? true) as never);
      },
    }),
    fakePort<ILedgerRepository>({
      entriesForBooking: () => Promise.resolve((options.entries ?? []) as never),
      recordJournal: (_tx, _tenantId, _legs, meta) => {
        journals.push({ meta: meta as Record<string, unknown> });
        return Promise.resolve('journal-1');
      },
    }),
    new OutboxService(),
    tenantDb.service,
  );

  return { useCase, journals, releases, events };
}

describe('ReleaseSettlementUseCase', () => {
  it('rejects an unknown settlement', async () => {
    const { useCase } = harness({ record: null });

    await expect(useCase.execute(TENANT_ID, SETTLEMENT_ID)).rejects.toBeInstanceOf(
      SettlementNotFound,
    );
  });

  it.each(['held', 'disputed', 'released', 'refunded'])(
    'does nothing while the settlement is %s',
    async (status) => {
      // Only a settlement whose dispute window has elapsed becomes payable.
      const { useCase, journals } = harness({ record: settlement({ status: status as never }) });

      await useCase.execute(TENANT_ID, SETTLEMENT_ID);

      expect(journals).toEqual([]);
    },
  );

  it('short-circuits on the status before it even reads the booking', async () => {
    // `releasePlan` re-checks the status and would also return null, so the early
    // guard looks redundant — it is not. Without it a settlement that is already
    // released loads the booking first, and a booking that cannot be read turns a
    // harmless replay into a thrown FinanceBookingNotFound.
    const { useCase, journals } = harness({
      record: settlement({ status: 'released' }),
      bookingMissing: true,
    });

    await expect(useCase.execute(TENANT_ID, SETTLEMENT_ID)).resolves.toBeUndefined();
    expect(journals).toEqual([]);
  });

  it('refuses to release when the booking cannot be read', async () => {
    const { useCase } = harness({ bookingMissing: true });

    await expect(useCase.execute(TENANT_ID, SETTLEMENT_ID)).rejects.toBeInstanceOf(
      FinanceBookingNotFound,
    );
  });

  it('refuses to release twice over an existing revenue journal', async () => {
    const { useCase } = harness({
      entries: [{ journalId: 'journal-existing', entryType: 'booking_revenue' }],
    });

    await expect(useCase.execute(TENANT_ID, SETTLEMENT_ID)).rejects.toBeInstanceOf(
      SettlementJournalExists,
    );
  });

  it('fails when the guarded release matched no row', async () => {
    // Another delivery of the same outbox event got there first.
    const { useCase } = harness({ released: false });

    await expect(useCase.execute(TENANT_ID, SETTLEMENT_ID)).rejects.toBeInstanceOf(
      SettlementNotReleasable,
    );
  });

  it('recognises the earnings and announces the partner revenue for tax', async () => {
    const { useCase, journals, events } = harness();

    await useCase.execute(TENANT_ID, SETTLEMENT_ID);

    expect(journals[0]?.meta).toEqual({
      bookingId: BOOKING_ID,
      paymentId: 'payment-1',
      memo: 'settlement.released',
    });
    expect(events).toEqual([
      {
        eventType: 'finance.partner_revenue_recognized',
        payload: {
          partnerId: PARTNER_ID,
          journalId: 'journal-1',
          amount: HELD.toString(),
          // The tax fact is dated by the SERVICE date, not the release date.
          serviceDate: SERVICE_DATE.toISOString(),
          bookingId: BOOKING_ID,
        },
      },
    ]);
  });

  it('announces no partner revenue for house inventory', async () => {
    // The tenant sold its own inventory; there is no partner to assess.
    const { useCase, journals, events } = harness({ isHouse: true });

    await useCase.execute(TENANT_ID, SETTLEMENT_ID);

    expect(journals).toHaveLength(1);
    expect(events).toEqual([]);
  });

  it('books a cancellation fee entirely to the tenant, with no partner revenue', async () => {
    const { useCase, journals, releases, events } = harness({
      record: settlement({ kind: 'cancellation_fee', retainedAmount: 120_000n }),
    });

    await useCase.execute(TENANT_ID, SETTLEMENT_ID);

    expect(journals[0]?.meta).toMatchObject({ memo: 'settlement.cancellation_fee.released' });
    expect(releases[0]).toMatchObject({
      tenantCommissionGross: 120_000n,
      tenantNetEarning: 120_000n,
      partnerGrossEarning: 0n,
      partnerPayable: 0n,
    });
    expect(events).toEqual([]);
  });

  it('falls back to the whole held amount when no retention was recorded', async () => {
    const { useCase, releases } = harness({
      record: settlement({ kind: 'cancellation_fee', retainedAmount: 0n }),
    });

    await useCase.execute(TENANT_ID, SETTLEMENT_ID);

    expect(releases[0]).toMatchObject({ tenantNetEarning: HELD });
  });
});
