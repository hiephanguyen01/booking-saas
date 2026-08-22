import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb, fakeTx } from '~testing';
import { defaultCommissionSnapshot } from '../../../../shared/domain/commission/commission-snapshot';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import type { ILedgerRepository } from '../../domain/ports/ledger-repository.port';
import type {
  ISettlementRepository,
  SettlementRecord,
} from '../../domain/ports/settlement-repository.port';
import { RecordClawbackJournalUseCase } from './record-clawback-journal.use-case';

const TENANT_ID = 'tenant-1';
const BOOKING_ID = 'booking-1';
const PARTNER_ID = 'partner-1';
const REVENUE_JOURNAL = 'journal-revenue';
const SERVICE_DATE = new Date('2026-08-10T02:00:00Z');

/** Only the fields the clawback path reads. */
const settlement = (overrides: Partial<SettlementRecord> = {}): SettlementRecord =>
  ({
    id: 'settlement-1',
    tenantId: TENANT_ID,
    bookingId: BOOKING_ID,
    paymentId: 'payment-1',
    partnerId: PARTNER_ID,
    status: 'dispute_window',
    kind: 'service_completed',
    onlineHeldAmount: 500_000n,
    refundedAmount: 0n,
    retainedAmount: 0n,
    ...overrides,
  }) as unknown as SettlementRecord;

/** A two-leg revenue journal, plus a payout leg that must NOT be reversed. */
const REVENUE_ENTRIES = [
  {
    journalId: REVENUE_JOURNAL,
    entryType: 'booking_revenue' as const,
    ownerType: 'tenant' as const,
    ownerId: null,
    debit: 500_000n,
    credit: 0n,
    payoutId: null,
  },
  {
    journalId: REVENUE_JOURNAL,
    entryType: 'partner_earning' as const,
    ownerType: 'partner' as const,
    ownerId: PARTNER_ID,
    debit: 0n,
    credit: 450_000n,
    payoutId: null,
  },
  {
    journalId: 'journal-payout',
    entryType: 'partner_earning' as const,
    ownerType: 'partner' as const,
    ownerId: PARTNER_ID,
    debit: 450_000n,
    credit: 0n,
    payoutId: 'payout-1',
  },
  {
    // A different journal on the same booking that carries NO payout id — a
    // withholding posting. Filtering on `payoutId === null` alone would sweep it
    // into the reversal; only the journal id keeps it out.
    journalId: 'journal-withholding',
    entryType: 'partner_vat_withheld' as const,
    ownerType: 'partner' as const,
    ownerId: PARTNER_ID,
    debit: 25_000n,
    credit: 0n,
    payoutId: null,
  },
];

interface Options {
  record?: SettlementRecord | null;
  entries?: typeof REVENUE_ENTRIES;
  isHouse?: boolean;
  bookingMissing?: boolean;
}

function harness(options: Options = {}) {
  const journals: Array<{ legs: unknown[]; meta: Record<string, unknown> }> = [];
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
                totalAmount: 500_000n,
                finalAmount: 500_000n,
                paidAmount: 500_000n,
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

  const useCase = new RecordClawbackJournalUseCase(
    fakePort<ILedgerRepository>({
      entriesForBooking: () => Promise.resolve((options.entries ?? REVENUE_ENTRIES) as never),
      recordJournal: (_tx, _tenantId, legs, meta) => {
        journals.push({ legs: legs as unknown[], meta: meta as Record<string, unknown> });
        return Promise.resolve('journal-clawback');
      },
    }),
    fakePort<ISettlementRepository>({
      findByBooking: () =>
        Promise.resolve(options.record === undefined ? settlement() : options.record),
    }),
    new OutboxService(),
    tenantDb.service,
  );

  return { useCase, journals, events };
}

describe('RecordClawbackJournalUseCase', () => {
  it('does nothing when the booking has no settlement', async () => {
    const { useCase, journals } = harness({ record: null });

    await useCase.execute(TENANT_ID, BOOKING_ID);

    expect(journals).toEqual([]);
  });

  it('does nothing once the settlement has been released', async () => {
    // A partial refund can later release the retained balance; a delayed or
    // duplicated old event must never reverse that newly-released journal.
    const { useCase, journals } = harness({ record: settlement({ status: 'released' }) });

    await useCase.execute(TENANT_ID, BOOKING_ID);

    expect(journals).toEqual([]);
  });

  it('does nothing when no revenue journal is active', async () => {
    const { useCase, journals } = harness({ entries: [] });

    await useCase.execute(TENANT_ID, BOOKING_ID);

    expect(journals).toEqual([]);
  });

  it('reverses only the revenue journal, never the payout legs on the same booking', async () => {
    // A payout entry is a separate movement; sweeping it into the reversal would
    // credit the partner for money that already left the account.
    const { useCase, journals } = harness();

    await useCase.execute(TENANT_ID, BOOKING_ID);

    expect(journals).toHaveLength(1);
    expect(journals[0]?.legs).toHaveLength(2);
    expect(journals[0]?.meta).toEqual({
      bookingId: BOOKING_ID,
      memo: `settlement.clawback:${REVENUE_JOURNAL}`,
    });
  });

  it('reverses the direction of every leg and marks it as a clawback', async () => {
    // The reversal legs carry entry type `clawback`, not the original type. That
    // is what stops `activeRevenueId` from reading them back as revenue and
    // clawing back the clawback.
    const { useCase, journals } = harness();

    await useCase.execute(TENANT_ID, BOOKING_ID);

    expect(journals[0]?.legs).toEqual([
      {
        owner: { ownerType: 'tenant', ownerId: null },
        entryType: 'clawback',
        debit: 0n,
        credit: 500_000n,
      },
      {
        owner: { ownerType: 'partner', ownerId: PARTNER_ID },
        entryType: 'clawback',
        debit: 450_000n,
        credit: 0n,
      },
    ]);
  });

  it('announces the reversal for tax so the partner revenue is undone', async () => {
    const { useCase, events } = harness();

    await useCase.execute(TENANT_ID, BOOKING_ID);

    expect(events).toEqual([
      {
        eventType: 'finance.partner_revenue_reversed',
        payload: {
          partnerId: PARTNER_ID,
          journalId: 'journal-clawback',
          reversesJournalId: REVENUE_JOURNAL,
          serviceDate: SERVICE_DATE.toISOString(),
          bookingId: BOOKING_ID,
        },
      },
    ]);
  });

  it('announces nothing for house inventory — the tenant sold it to itself', async () => {
    const { useCase, journals, events } = harness({ isHouse: true });

    await useCase.execute(TENANT_ID, BOOKING_ID);

    expect(journals).toHaveLength(1);
    expect(events).toEqual([]);
  });

  it('still writes the reversal when the booking row cannot be read', async () => {
    // The ledger correction is the point; the tax announcement is best-effort.
    const { useCase, journals, events } = harness({ bookingMissing: true });

    await useCase.execute(TENANT_ID, BOOKING_ID);

    expect(journals).toHaveLength(1);
    expect(events).toEqual([]);
  });
});
