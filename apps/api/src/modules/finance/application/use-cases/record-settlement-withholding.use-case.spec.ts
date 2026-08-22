import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import type { ILedgerRepository } from '../../domain/ports/ledger-repository.port';
import type { SettlementRecord } from '../../domain/ports/settlement-repository.port';
import type { ITaxComplianceRepository } from '../../domain/ports/tax-compliance-repository.port';
import { RecordSettlementWithholdingUseCase } from './record-settlement-withholding.use-case';

const TENANT_ID = 'tenant-1';
const SETTLEMENT_ID = 'settlement-1';
const COMPLETED_AT = new Date('2026-08-10T12:00:00Z');
const UPDATED_AT = new Date('2026-09-01T12:00:00Z');

const settlement = (overrides: Partial<SettlementRecord> = {}): SettlementRecord =>
  ({
    id: SETTLEMENT_ID,
    tenantId: TENANT_ID,
    bookingId: 'booking-1',
    paymentId: 'payment-1',
    partnerId: 'partner-1',
    partnerVatWithheld: 25_000n,
    partnerPitWithheld: 10_000n,
    completedAt: COMPLETED_AT,
    updatedAt: UPDATED_AT,
    ...overrides,
  }) as unknown as SettlementRecord;

interface Options {
  duplicate?: boolean;
  attached?: boolean;
}

function harness(options: Options = {}) {
  const journals: Array<Record<string, unknown>> = [];
  const events: Array<Record<string, unknown>> = [];
  const sourceKeys: string[] = [];
  const tenantDb = fakeTenantDb();
  return {
    useCase: new RecordSettlementWithholdingUseCase(
      fakePort<ITaxComplianceRepository>({
        findEventBySourceKey: (_tx, _tenantId, key) => {
          sourceKeys.push(key);
          return Promise.resolve((options.duplicate ? { id: 'event-1' } : null) as never);
        },
        attachWithholdingJournal: () => Promise.resolve(options.attached ?? true),
        createEvent: (_tx, _tenantId, data) => {
          events.push(data as unknown as Record<string, unknown>);
          return Promise.resolve(null as never);
        },
      }),
      fakePort<ILedgerRepository>({
        recordJournal: (_tx, _tenantId, _legs, meta) => {
          journals.push(meta as Record<string, unknown>);
          return Promise.resolve('journal-1');
        },
      }),
    ),
    tx: tenantDb.tx,
    journals,
    events,
    sourceKeys,
  };
}

describe('RecordSettlementWithholdingUseCase', () => {
  it('assesses nothing when no tax was withheld', async () => {
    const { useCase, tx, journals } = harness();

    await useCase.execute(
      tx,
      TENANT_ID,
      settlement({ partnerVatWithheld: 0n, partnerPitWithheld: 0n }),
      500_000n,
    );

    expect(journals).toEqual([]);
  });

  it('assesses nothing on a zero taxable revenue', async () => {
    const { useCase, tx, journals } = harness();

    await useCase.execute(tx, TENANT_ID, settlement(), 0n);

    expect(journals).toEqual([]);
  });

  it('keys the assessment on the settlement so redelivery records it once', async () => {
    // `booking.completed` is at-least-once. The prefix is deliberately unchanged
    // from when this ran at release, so a settlement assessed by an older deploy
    // cannot produce a second event.
    const { useCase, tx, sourceKeys, events } = harness();

    await useCase.execute(tx, TENANT_ID, settlement(), 500_000n);

    expect(sourceKeys).toEqual([`completion:${SETTLEMENT_ID}`]);
    expect(events[0]).toMatchObject({ sourceKey: `completion:${SETTLEMENT_ID}` });
  });

  it('records nothing on a redelivery', async () => {
    const { useCase, tx, journals, events } = harness({ duplicate: true });

    await useCase.execute(tx, TENANT_ID, settlement(), 500_000n);

    expect(journals).toEqual([]);
    expect(events).toEqual([]);
  });

  it('dates the filing period by when the transaction was ACCEPTED', async () => {
    // Not the month a later payout cleared — `preparePeriod` buckets on this.
    const { useCase, tx, events } = harness();

    await useCase.execute(tx, TENANT_ID, settlement(), 500_000n);

    expect(events[0]).toMatchObject({
      eventType: 'withholding',
      taxableRevenue: 500_000n,
      vatAmount: 25_000n,
      pitAmount: 10_000n,
      occurredAt: COMPLETED_AT,
    });
  });

  it('falls back to the settlement update time when completion was never stamped', async () => {
    const { useCase, tx, events } = harness();

    await useCase.execute(tx, TENANT_ID, settlement({ completedAt: null }), 500_000n);

    expect(events[0]).toMatchObject({ occurredAt: UPDATED_AT });
  });

  it('fails loudly when the journal was concurrently attached', async () => {
    // Two writers on the same settlement would otherwise leave one journal
    // orphaned and the trail unbalanced.
    const { useCase, tx, events } = harness({ attached: false });

    await expect(useCase.execute(tx, TENANT_ID, settlement(), 500_000n)).rejects.toThrow(
      'concurrently attached',
    );
    expect(events).toEqual([]);
  });
});
