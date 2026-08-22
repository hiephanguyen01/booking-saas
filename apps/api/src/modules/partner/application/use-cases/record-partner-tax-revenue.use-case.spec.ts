import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb, fakeTx } from '~testing';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import type { TaxThresholdRule } from '../../../../shared/domain/tax/threshold';
import type {
  IPartnerRepository,
  PartnerRecord,
} from '../../domain/ports/partner-repository.port';
import type {
  IPartnerTaxRepository,
  PartnerTaxAssessmentRecord,
  PartnerTaxAssessmentUpdate,
} from '../../domain/ports/partner-tax-repository.port';
import {
  RecordPartnerTaxRevenueUseCase,
  type RecordPartnerTaxRevenueInput,
} from './record-partner-tax-revenue.use-case';

const TENANT_ID = 'tenant-1';
const PARTNER_ID = 'partner-1';
const DB_NOW = new Date('2026-08-19T00:00:00Z');
/** 2026-05-05 in Asia/Ho_Chi_Minh — tax year 2026, quarter 2. */
const SERVICE_DATE = new Date('2026-05-05T03:00:00Z');

const RULE: TaxThresholdRule = {
  id: 'rule-2026',
  thresholdAmount: 200_000_000n,
  // Well before any tax year the tests use: `vietnamTaxYearStart` is midnight
  // in Asia/Ho_Chi_Minh, i.e. 17:00Z the previous day, so a rule dated
  // 2026-01-01T00:00Z would not yet be effective for tax year 2026.
  effectiveFrom: new Date('2020-01-01T00:00:00Z'),
  effectiveTo: null,
  legalRef: 'TT40/2021',
  revision: 1,
};

const partner = (overrides: Partial<PartnerRecord> = {}) =>
  ({
    id: PARTNER_ID,
    isHouse: false,
    taxStatus: 'household_below_threshold',
    ...overrides,
  }) as unknown as PartnerRecord;

const assessment = (
  overrides: Partial<PartnerTaxAssessmentRecord> = {},
): PartnerTaxAssessmentRecord =>
  ({
    id: 'assessment-1',
    tenantId: TENANT_ID,
    partnerId: PARTNER_ID,
    taxYear: 2026,
    status: 'below_threshold',
    platformRevenue: 0n,
    externalRevenue: 0n,
    thresholdAmount: 200_000_000n,
    thresholdRuleId: RULE.id,
    thresholdLegalRef: RULE.legalRef,
    thresholdRevision: 1,
    crossedAt: null,
    crossedQuarter: null,
    classificationSource: 'automatic_threshold',
    manualOverrideStatus: null,
    manualOverrideReason: null,
    manualOverrideBy: null,
    manualOverrideUntil: null,
    declarationUpdatedAt: new Date('2026-02-01T00:00:00Z'),
    evaluatedAt: DB_NOW,
    version: 1,
    ...overrides,
  }) as PartnerTaxAssessmentRecord;

interface Options {
  partner?: PartnerRecord | null;
  assessment?: PartnerTaxAssessmentRecord;
  platformRevenue?: bigint;
  inserted?: boolean;
  originalAmount?: bigint | null;
  rules?: TaxThresholdRule[];
}

function harness(options: Options = {}) {
  const inserts: unknown[] = [];
  const updates: PartnerTaxAssessmentUpdate[] = [];
  const statusWrites: unknown[] = [];
  const events: Array<{ eventType: string; payload: Record<string, unknown> }> = [];
  const ensured: unknown[] = [];
  const locks: string[] = [];
  const tx = fakeTx({
    outboxEvent: {
      create: (args: { data: { eventType: string; payload: Record<string, unknown> } }) => {
        events.push({ eventType: args.data.eventType, payload: args.data.payload });
        return Promise.resolve({});
      },
    },
  });
  const tenantDb = fakeTenantDb({ tx, now: DB_NOW });
  const row = options.assessment ?? assessment();
  return {
    useCase: new RecordPartnerTaxRevenueUseCase(
      fakePort<IPartnerRepository>({
        findByIdForUpdate: () =>
          Promise.resolve(
            (options.partner === undefined ? partner() : options.partner) as never,
          ),
        updateTaxStatus: (_tx, partnerId, status) => {
          statusWrites.push({ partnerId, status });
          return Promise.resolve({} as PartnerRecord);
        },
      }),
      fakePort<IPartnerTaxRepository>({
        listActiveThresholdRules: () => Promise.resolve(options.rules ?? [RULE]),
        ensureAssessment: (_tx, args) => {
          ensured.push(args);
          return Promise.resolve(row);
        },
        lockAssessment: (_tx, id) => {
          locks.push(id);
          return Promise.resolve(row);
        },
        insertRevenueEvent: (_tx, args) => {
          inserts.push(args);
          return Promise.resolve(options.inserted ?? true);
        },
        findRevenueAmountBySource: () =>
          Promise.resolve(options.originalAmount === undefined ? 5_000_000n : options.originalAmount),
        sumPlatformRevenue: () => Promise.resolve(options.platformRevenue ?? 10_000_000n),
        updateAssessment: (_tx, _id, update) => {
          updates.push(update);
          return Promise.resolve({ ...row, ...update });
        },
      }),
      new OutboxService(),
      tenantDb.service,
    ),
    tenantDb,
    inserts,
    updates,
    statusWrites,
    events,
    ensured,
    locks,
  };
}

const input = (overrides: Partial<RecordPartnerTaxRevenueInput> = {}) =>
  ({
    partnerId: PARTNER_ID,
    sourceType: 'settlement_release',
    sourceId: 'journal-1',
    amount: 10_000_000n,
    serviceDate: SERVICE_DATE,
    ...overrides,
  }) as RecordPartnerTaxRevenueInput;

describe('RecordPartnerTaxRevenueUseCase', () => {
  it('IGNORES a partner that is not a household', async () => {
    // Company partners invoice their own VAT; the household threshold does not
    // apply to them at all.
    const { useCase, inserts } = harness({ partner: partner({ taxStatus: 'company_vat' }) });

    await useCase.execute(TENANT_ID, input());

    expect(inserts).toEqual([]);
  });

  it('ignores a HOUSE partner', async () => {
    // The tenant selling its own inventory is not a taxable counterparty here.
    const { useCase, inserts } = harness({ partner: partner({ isHouse: true }) });

    await useCase.execute(TENANT_ID, input());

    expect(inserts).toEqual([]);
  });

  it('ignores a partner that no longer exists', async () => {
    const { useCase, inserts } = harness({ partner: null });

    await useCase.execute(TENANT_ID, input());

    expect(inserts).toEqual([]);
  });

  it('files revenue under the VIETNAM tax year of the service date', async () => {
    // The service date is what the law keys on, not the settlement date, and
    // the year boundary is Asia/Ho_Chi_Minh — a UTC read would move a
    // 31 December evening into the following year.
    const { useCase, ensured } = harness();

    await useCase.execute(
      TENANT_ID,
      input({ serviceDate: new Date('2026-12-31T18:00:00Z') }),
    );

    expect(ensured).toEqual([
      {
        tenantId: TENANT_ID,
        partnerId: PARTNER_ID,
        taxYear: 2027,
        thresholdRuleId: RULE.id,
        thresholdAmount: RULE.thresholdAmount,
        initialStatus: 'missing_declaration',
      },
    ]);
  });

  it('LOCKS the assessment before touching it', async () => {
    // Two settlements releasing at once would otherwise both read the same
    // revenue total and one of the two updates would be lost.
    const { useCase, locks } = harness();

    await useCase.execute(TENANT_ID, input());

    expect(locks).toEqual(['assessment-1']);
  });

  it('records a clawback as the NEGATIVE of the release it reverses', async () => {
    // Deriving the amount from the original event is what keeps a partial
    // refund from over- or under-reversing the taxable revenue.
    const { useCase, inserts } = harness({ originalAmount: 7_000_000n });

    await useCase.execute(
      TENANT_ID,
      input({
        sourceType: 'settlement_clawback',
        sourceId: 'clawback-1',
        amount: undefined,
        reversesSourceId: 'journal-1',
      }),
    );

    expect(inserts[0]).toMatchObject({ sourceType: 'settlement_clawback', amount: -7_000_000n });
  });

  it('REFUSES to guess when the release being reversed has not landed yet', async () => {
    // Recording zero would permanently understate the year's revenue.
    const { useCase, inserts } = harness({ originalAmount: null });

    await expect(
      useCase.execute(
        TENANT_ID,
        input({ sourceType: 'settlement_clawback', amount: undefined, reversesSourceId: 'journal-1' }),
      ),
    ).rejects.toThrow('not available yet');
    expect(inserts).toEqual([]);
  });

  it('refuses an event carrying no amount at all', async () => {
    const { useCase } = harness();

    await expect(
      useCase.execute(TENANT_ID, input({ amount: undefined })),
    ).rejects.toThrow('missing its amount');
  });

  it('is IDEMPOTENT — a redelivered event changes nothing', async () => {
    // The outbox is at-least-once; a duplicate insert is rejected by the unique
    // source key and everything after it must be skipped.
    const { useCase, updates, statusWrites, events } = harness({ inserted: false });

    await useCase.execute(TENANT_ID, input());

    expect(updates).toEqual([]);
    expect(statusWrites).toEqual([]);
    expect(events).toEqual([]);
  });

  it('re-sums platform revenue from the ledger rather than adding the delta', async () => {
    // Summing is what makes a redelivered or reordered event harmless.
    const { useCase, updates } = harness({ platformRevenue: 123_000_000n });

    await useCase.execute(TENANT_ID, input());

    expect(updates[0]).toMatchObject({ platformRevenue: 123_000_000n });
  });

  it('CROSSES the threshold and moves the partner to declaring', async () => {
    const { useCase, updates, statusWrites, events } = harness({
      platformRevenue: 250_000_000n,
    });

    await useCase.execute(TENANT_ID, input());

    expect(updates[0]).toMatchObject({
      status: 'exceeded',
      crossedAt: DB_NOW,
      crossedQuarter: 2,
    });
    expect(statusWrites).toEqual([
      { partnerId: PARTNER_ID, status: 'household_declaring' },
    ]);
    expect(events).toEqual([
      {
        eventType: 'partner.tax_classification_changed',
        payload: {
          partnerId: PARTNER_ID,
          taxYear: 2026,
          from: 'household_below_threshold',
          to: 'household_declaring',
          reason: 'threshold_crossed',
        },
      },
    ]);
  });

  it('counts the partner’s DECLARED external revenue towards the threshold', async () => {
    // The threshold is on total household revenue, not only what BookingOS saw.
    const { useCase, updates } = harness({
      platformRevenue: 150_000_000n,
      assessment: assessment({ externalRevenue: 100_000_000n }),
    });

    await useCase.execute(TENANT_ID, input());

    expect(updates[0]).toMatchObject({ status: 'exceeded' });
  });

  it('does not re-stamp the crossing date on a later event', async () => {
    // The quarter it was crossed in is what the filing references; moving it
    // would rewrite history.
    const crossedAt = new Date('2026-04-01T00:00:00Z');
    const { useCase, updates, events } = harness({
      platformRevenue: 250_000_000n,
      assessment: assessment({
        status: 'exceeded',
        crossedAt,
        crossedQuarter: 1,
        declarationUpdatedAt: new Date('2026-02-01T00:00:00Z'),
      }),
      partner: partner({ taxStatus: 'household_declaring' }),
    });

    await useCase.execute(TENANT_ID, input());

    expect(updates[0]).toMatchObject({ crossedAt, crossedQuarter: 1 });
    expect(events).toEqual([]);
  });

  it('keeps a MANUAL override in force and marks the source as such', async () => {
    // An operator decision must not be undone by the next settlement.
    const { useCase, updates, statusWrites } = harness({
      platformRevenue: 250_000_000n,
      assessment: assessment({
        manualOverrideStatus: 'household_below_threshold',
        manualOverrideUntil: new Date('2026-12-31T00:00:00Z'),
      }),
    });

    await useCase.execute(TENANT_ID, input());

    expect(updates[0]).toMatchObject({
      status: 'below_threshold',
      classificationSource: 'manual_override',
    });
    expect(statusWrites).toEqual([]);
  });

  it('lets an EXPIRED override fall back to the automatic rule', async () => {
    const { useCase, updates, statusWrites } = harness({
      platformRevenue: 250_000_000n,
      assessment: assessment({
        manualOverrideStatus: 'household_below_threshold',
        manualOverrideUntil: new Date('2026-01-01T00:00:00Z'),
      }),
    });

    await useCase.execute(TENANT_ID, input());

    expect(updates[0]).toMatchObject({
      status: 'exceeded',
      classificationSource: 'automatic_threshold',
    });
    expect(statusWrites).toHaveLength(1);
  });

  it('reports a move DOWN as an assessment update, not a crossing', async () => {
    // A partner sitting in the declaring regime while the year's total stays
    // under the threshold moves back down once they have declared. Calling that
    // "threshold_crossed" would put a crossing in the audit trail that never
    // happened.
    const { useCase, statusWrites, events } = harness({
      platformRevenue: 10_000_000n,
      partner: partner({ taxStatus: 'household_declaring' }),
      assessment: assessment({ status: 'below_threshold' }),
    });

    await useCase.execute(TENANT_ID, input());

    expect(statusWrites).toEqual([
      { partnerId: PARTNER_ID, status: 'household_below_threshold' },
    ]);
    expect(events[0]?.payload).toMatchObject({
      from: 'household_declaring',
      to: 'household_below_threshold',
      reason: 'assessment_updated',
    });
  });

  it('stays silent when the classification did not move', async () => {
    // Only a real change is worth an event; the quote calculator re-reads on
    // every quote anyway.
    const { useCase, statusWrites, events } = harness({ platformRevenue: 10_000_000n });

    await useCase.execute(TENANT_ID, input());

    expect(statusWrites).toEqual([]);
    expect(events).toEqual([]);
  });

  it('attaches the booking to the revenue event when one was named', async () => {
    const { useCase, inserts } = harness();

    await useCase.execute(TENANT_ID, input({ bookingId: 'booking-1' }));

    expect(inserts[0]).toMatchObject({ metadata: { bookingId: 'booking-1' } });
  });

  it('writes an empty metadata object rather than null when there is no booking', async () => {
    const { useCase, inserts } = harness();

    await useCase.execute(TENANT_ID, input());

    expect(inserts[0]).toMatchObject({ metadata: {} });
  });
});
