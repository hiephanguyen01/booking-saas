import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb, fakeTx } from '~testing';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import type { TaxThresholdRule } from '../../../../shared/domain/tax/threshold';
import { TaxThresholdRuleUnavailable } from '../partner-http-errors';
import type {
  IPartnerRepository,
  PartnerRecord,
} from '../../domain/ports/partner-repository.port';
import type {
  IPartnerTaxRepository,
  PartnerTaxAssessmentRecord,
  PartnerTaxAssessmentUpdate,
} from '../../domain/ports/partner-tax-repository.port';
import { ReassessPartnerTaxThresholdUseCase } from './reassess-partner-tax-threshold.use-case';

const TENANT_ID = 'tenant-1';
const PARTNER_ID = 'partner-1';
/** 2026-08-19 in Asia/Ho_Chi_Minh — tax year 2026, quarter 3. */
const DB_NOW = new Date('2026-08-19T00:00:00Z');

const RULE: TaxThresholdRule = {
  id: 'rule-2026',
  thresholdAmount: 200_000_000n,
  effectiveFrom: new Date('2020-01-01T00:00:00Z'),
  effectiveTo: null,
  legalRef: 'TT40/2021',
  revision: 1,
};

const partner = (overrides: Record<string, unknown> = {}) =>
  ({ id: PARTNER_ID, isHouse: false, taxStatus: 'household_declaring', ...overrides }) as unknown as PartnerRecord;

const assessment = (
  overrides: Partial<PartnerTaxAssessmentRecord> = {},
): PartnerTaxAssessmentRecord =>
  ({
    id: 'assessment-1',
    taxYear: 2026,
    status: 'exceeded',
    platformRevenue: 0n,
    externalRevenue: 0n,
    thresholdAmount: 200_000_000n,
    thresholdRuleId: RULE.id,
    crossedAt: new Date('2026-04-01T00:00:00Z'),
    crossedQuarter: 2,
    manualOverrideStatus: null,
    manualOverrideUntil: null,
    declarationUpdatedAt: new Date('2026-02-01T00:00:00Z'),
    ...overrides,
  }) as PartnerTaxAssessmentRecord;

const FACT = {
  journalId: 'journal-1',
  amount: 5_000_000n,
  serviceDate: new Date('2026-05-05T03:00:00Z'),
  bookingId: 'booking-1',
};

interface Options {
  partner?: PartnerRecord | null;
  existing?: PartnerTaxAssessmentRecord | null;
  assessment?: PartnerTaxAssessmentRecord;
  rules?: TaxThresholdRule[];
  facts?: typeof FACT[];
  platformRevenue?: bigint;
}

function harness(options: Options = {}) {
  const inserts: unknown[] = [];
  const updates: PartnerTaxAssessmentUpdate[] = [];
  const statusWrites: unknown[] = [];
  const events: Array<{ eventType: string; payload: Record<string, unknown> }> = [];
  const factWindows: Array<{ from: Date; to: Date }> = [];
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
    useCase: new ReassessPartnerTaxThresholdUseCase(
      fakePort<IPartnerRepository>({
        findByIdForUpdate: () =>
          Promise.resolve((options.partner === undefined ? partner() : options.partner) as never),
        updateTaxStatus: (_tx, partnerId, status) => {
          statusWrites.push({ partnerId, status });
          return Promise.resolve({} as PartnerRecord);
        },
      }),
      fakePort<IPartnerTaxRepository>({
        findAssessment: () =>
          Promise.resolve(options.existing === undefined ? row : options.existing),
        listActiveThresholdRules: () => Promise.resolve(options.rules ?? [RULE]),
        ensureAssessment: () => Promise.resolve(row),
        lockAssessment: () => Promise.resolve(row),
        listReleasedRevenueFacts: (_tx, _partnerId, from, to) => {
          factWindows.push({ from, to });
          return Promise.resolve(options.facts ?? [FACT]);
        },
        insertRevenueEvent: (_tx, args) => {
          inserts.push(args);
          return Promise.resolve(true);
        },
        sumPlatformRevenue: () => Promise.resolve(options.platformRevenue ?? 250_000_000n),
        updateAssessment: (_tx, _id, update) => {
          updates.push(update);
          return Promise.resolve({ ...row, ...update });
        },
      }),
      new OutboxService(),
      tenantDb.service,
    ),
    inserts,
    updates,
    statusWrites,
    events,
    factWindows,
  };
}

describe('ReassessPartnerTaxThresholdUseCase', () => {
  it('ignores a partner the household threshold does not apply to', async () => {
    const company = harness({ partner: partner({ taxStatus: 'company_vat' }) });
    const house = harness({ partner: partner({ isHouse: true }) });
    const gone = harness({ partner: null });

    await company.useCase.execute(TENANT_ID, PARTNER_ID);
    await house.useCase.execute(TENANT_ID, PARTNER_ID);
    await gone.useCase.execute(TENANT_ID, PARTNER_ID);

    expect(company.updates).toEqual([]);
    expect(house.updates).toEqual([]);
    expect(gone.updates).toEqual([]);
  });

  it('refuses when no threshold rule is effective for the year', async () => {
    const { useCase } = harness({ rules: [] });

    await expect(useCase.execute(TENANT_ID, PARTNER_ID)).rejects.toBeInstanceOf(
      TaxThresholdRuleUnavailable,
    );
  });

  it('BACKFILLS released revenue over the Vietnam tax year', async () => {
    // The year runs 1 January to 1 January in Asia/Ho_Chi_Minh, which is 17:00Z
    // the previous day — a UTC window would take in the wrong days at both ends.
    const { useCase, factWindows, inserts } = harness();

    await useCase.execute(TENANT_ID, PARTNER_ID);

    expect(factWindows).toEqual([
      {
        from: new Date('2025-12-31T17:00:00.000Z'),
        to: new Date('2026-12-31T17:00:00.000Z'),
      },
    ]);
    expect(inserts[0]).toMatchObject({
      sourceType: 'settlement_release',
      sourceId: 'journal-1',
      amount: 5_000_000n,
      metadata: { bookingId: 'booking-1', backfilled: true },
    });
  });

  it('applies the CURRENT rule threshold, not the stored one', async () => {
    // The whole point of a reassessment is that the legal figure moved.
    const { useCase, updates } = harness({
      rules: [{ ...RULE, id: 'rule-new', thresholdAmount: 500_000_000n, revision: 2 }],
      platformRevenue: 250_000_000n,
    });

    await useCase.execute(TENANT_ID, PARTNER_ID);

    expect(updates[0]).toMatchObject({
      thresholdAmount: 500_000_000n,
      thresholdRuleId: 'rule-new',
    });
  });

  it('lets a LEGAL RULE CHANGE move a partner back down', async () => {
    // A revenue-driven crossing is sticky so refunds cannot make the status
    // oscillate; only a change in the law itself may reverse it.
    const { useCase, updates, statusWrites, events } = harness({
      rules: [{ ...RULE, id: 'rule-new', thresholdAmount: 500_000_000n, revision: 2 }],
      platformRevenue: 250_000_000n,
    });

    await useCase.execute(TENANT_ID, PARTNER_ID);

    expect(updates[0]).toMatchObject({
      status: 'below_threshold',
      classificationSource: 'legal_rule',
    });
    expect(statusWrites).toEqual([
      { partnerId: PARTNER_ID, status: 'household_below_threshold' },
    ]);
    expect(events[0]?.payload).toMatchObject({ reason: 'legal_rule_changed' });
  });

  it('KEEPS an exceeded partner exceeded when the rule did not change', async () => {
    // Refunds pushing the total back under must land in manual review, not in a
    // silent downgrade.
    const { useCase, updates, statusWrites } = harness({ platformRevenue: 10_000_000n });

    await useCase.execute(TENANT_ID, PARTNER_ID);

    expect(updates[0]).toMatchObject({
      status: 'manual_review',
      classificationSource: 'automatic_threshold',
    });
    expect(statusWrites).toEqual([]);
  });

  it('treats a first-ever assessment as no rule change', async () => {
    // There is no previous rule to have changed, so the downgrade allowance
    // must not apply.
    const { useCase, updates } = harness({
      existing: null,
      platformRevenue: 10_000_000n,
    });

    await useCase.execute(TENANT_ID, PARTNER_ID);

    expect(updates[0]).toMatchObject({ classificationSource: 'automatic_threshold' });
  });

  it('reports a scheduled reassessment separately from a legal change', async () => {
    const { useCase, events } = harness({
      assessment: assessment({ status: 'below_threshold', crossedAt: null, crossedQuarter: null }),
      partner: partner({ taxStatus: 'household_below_threshold' }),
      platformRevenue: 250_000_000n,
    });

    await useCase.execute(TENANT_ID, PARTNER_ID);

    expect(events[0]?.payload).toMatchObject({
      to: 'household_declaring',
      reason: 'scheduled_reassessment',
    });
  });

  it('keeps a manual override in force', async () => {
    const { useCase, updates, statusWrites } = harness({
      assessment: assessment({
        manualOverrideStatus: 'household_below_threshold',
        manualOverrideUntil: new Date('2026-12-31T00:00:00Z'),
      }),
      platformRevenue: 250_000_000n,
    });

    await useCase.execute(TENANT_ID, PARTNER_ID);

    expect(updates[0]).toMatchObject({ classificationSource: 'manual_override' });
    expect(statusWrites).toEqual([
      { partnerId: PARTNER_ID, status: 'household_below_threshold' },
    ]);
  });
});
