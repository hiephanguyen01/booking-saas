import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import type { ILedgerRepository } from '../../domain/ports/ledger-repository.port';
import type { SettlementRecord } from '../../domain/ports/settlement-repository.port';
import type { ITaxComplianceRepository } from '../../domain/ports/tax-compliance-repository.port';
import { RecordWithholdingReversalUseCase } from './record-withholding-reversal.use-case';

const TENANT_ID = 'tenant-1';
const REFUND_ID = 'refund-1';

const settlement = (): SettlementRecord =>
  ({
    id: 'settlement-1',
    tenantId: TENANT_ID,
    bookingId: 'booking-1',
    paymentId: 'payment-1',
    partnerId: 'partner-1',
    updatedAt: new Date('2026-09-01T12:00:00Z'),
  }) as unknown as SettlementRecord;

/** 1,000,000 revenue → 50,000 VAT + 20,000 PIT (5% / 2%). */
const ASSESSMENT = {
  id: 'event-assessment',
  taxableRevenue: 1_000_000n,
  vatAmount: 50_000n,
  pitAmount: 20_000n,
};

interface Options {
  duplicate?: boolean;
  assessment?: typeof ASSESSMENT | null;
  reversed?: { taxableRevenue: bigint; vatAmount: bigint; pitAmount: bigint };
}

function harness(options: Options = {}) {
  const journals: Array<Record<string, unknown>> = [];
  const events: Array<Record<string, unknown>> = [];
  const tenantDb = fakeTenantDb();
  return {
    useCase: new RecordWithholdingReversalUseCase(
      fakePort<ITaxComplianceRepository>({
        findEventBySourceKey: () =>
          Promise.resolve((options.duplicate ? { id: 'event-1' } : null) as never),
        findAssessmentBySettlement: () =>
          Promise.resolve(
            (options.assessment === undefined ? ASSESSMENT : options.assessment) as never,
          ),
        totalReversedForAssessment: () =>
          Promise.resolve(
            (options.reversed ?? {
              taxableRevenue: 0n,
              vatAmount: 0n,
              pitAmount: 0n,
            }) as never,
          ),
        createEvent: (_tx, _tenantId, data) => {
          events.push(data as unknown as Record<string, unknown>);
          return Promise.resolve(null as never);
        },
      }),
      fakePort<ILedgerRepository>({
        recordJournal: (_tx, _tenantId, _legs, meta) => {
          journals.push(meta as Record<string, unknown>);
          return Promise.resolve('journal-reversal');
        },
      }),
    ),
    tx: tenantDb.tx,
    journals,
    events,
  };
}

describe('RecordWithholdingReversalUseCase', () => {
  it('reverses nothing on a redelivery of the same refund', async () => {
    const { useCase, tx, events } = harness({ duplicate: true });

    await useCase.execute(tx, TENANT_ID, settlement(), REFUND_ID, 500_000n);

    expect(events).toEqual([]);
  });

  it('reverses nothing when no assessment was ever recorded', async () => {
    const { useCase, tx, events } = harness({ assessment: null });

    await useCase.execute(tx, TENANT_ID, settlement(), REFUND_ID, 500_000n);

    expect(events).toEqual([]);
  });

  it('reverses tax in proportion to the refunded share', async () => {
    // Half the revenue refunded → half the VAT and half the PIT come back, linked
    // to the original assessment rather than editing it.
    const { useCase, tx, events } = harness();

    await useCase.execute(tx, TENANT_ID, settlement(), REFUND_ID, 500_000n);

    expect(events[0]).toMatchObject({
      eventType: 'reversal',
      originalEventId: ASSESSMENT.id,
      sourceKey: `refund:${REFUND_ID}`,
      taxableRevenue: 500_000n,
      vatAmount: 25_000n,
      pitAmount: 10_000n,
    });
  });

  it('reverses only the INCREMENT over what was already reversed', async () => {
    // The caller passes the CUMULATIVE refunded amount; a second partial refund
    // must not reverse the first one's tax again.
    const { useCase, tx, events } = harness({
      reversed: { taxableRevenue: 300_000n, vatAmount: 15_000n, pitAmount: 6_000n },
    });

    await useCase.execute(tx, TENANT_ID, settlement(), REFUND_ID, 500_000n);

    expect(events[0]).toMatchObject({
      taxableRevenue: 200_000n,
      vatAmount: 10_000n,
      pitAmount: 4_000n,
    });
  });

  it('never reverses more tax than was assessed', async () => {
    // A refund can exceed the taxable base (it includes the security deposit);
    // the reversal is capped at the assessment.
    const { useCase, tx, events } = harness();

    await useCase.execute(tx, TENANT_ID, settlement(), REFUND_ID, 5_000_000n);

    expect(events[0]).toMatchObject({
      taxableRevenue: 1_000_000n,
      vatAmount: 50_000n,
      pitAmount: 20_000n,
    });
  });

  it('records nothing once the assessment is fully reversed', async () => {
    const { useCase, tx, events, journals } = harness({
      reversed: { taxableRevenue: 1_000_000n, vatAmount: 50_000n, pitAmount: 20_000n },
    });

    await useCase.execute(tx, TENANT_ID, settlement(), REFUND_ID, 1_000_000n);

    expect(journals).toEqual([]);
    expect(events).toEqual([]);
  });

  it('links the reversal journal back to the assessment in its memo', async () => {
    const { useCase, tx, journals } = harness();

    await useCase.execute(tx, TENANT_ID, settlement(), REFUND_ID, 500_000n);

    expect(journals[0]).toMatchObject({ memo: `tax.withholding.reversal:${ASSESSMENT.id}` });
  });
});
