import { describe, expect, it } from 'vitest';
import type { RecordPartnerTaxDeclarationInput } from '@booking/contracts';
import { fakePort, fakeTenantDb, fakeTx } from '~testing';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import type { AuditEntry, IAuditWriter } from '../../../../shared/audit/audit-writer.port';
import type { TaxThresholdRule } from '../../../../shared/domain/tax/threshold';
import {
  FutureTaxYearDeclaration,
  PartnerNotFound,
  PartnerTaxAssessmentNotApplicable,
} from '../../domain/errors/partner-errors';
import type {
  IPartnerRepository,
  PartnerRecord,
} from '../../domain/ports/partner-repository.port';
import type {
  IPartnerTaxRepository,
  PartnerTaxAssessmentRecord,
  PartnerTaxAssessmentUpdate,
} from '../../domain/ports/partner-tax-repository.port';
import { RecordPartnerTaxDeclarationUseCase } from './record-partner-tax-declaration.use-case';

const TENANT_ID = 'tenant-1';
const PARTNER_ID = 'partner-1';
const ACTOR = 'user-partner';
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
  ({ id: PARTNER_ID, isHouse: false, taxStatus: 'household_below_threshold', ...overrides }) as unknown as PartnerRecord;

const assessment = (
  overrides: Partial<PartnerTaxAssessmentRecord> = {},
): PartnerTaxAssessmentRecord =>
  ({
    id: 'assessment-1',
    taxYear: 2026,
    status: 'missing_declaration',
    platformRevenue: 0n,
    externalRevenue: 0n,
    thresholdAmount: 200_000_000n,
    thresholdRuleId: RULE.id,
    crossedAt: null,
    crossedQuarter: null,
    manualOverrideStatus: null,
    manualOverrideUntil: null,
    declarationUpdatedAt: null,
    ...overrides,
  }) as PartnerTaxAssessmentRecord;

interface Options {
  partner?: PartnerRecord | null;
  assessment?: PartnerTaxAssessmentRecord;
  platformRevenue?: bigint;
}

function harness(options: Options = {}) {
  const declarations: unknown[] = [];
  const updates: PartnerTaxAssessmentUpdate[] = [];
  const statusWrites: unknown[] = [];
  const audits: AuditEntry[] = [];
  const events: Array<{ eventType: string; payload: Record<string, unknown> }> = [];
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
    useCase: new RecordPartnerTaxDeclarationUseCase(
      fakePort<IPartnerRepository>({
        findByIdForUpdate: () =>
          Promise.resolve((options.partner === undefined ? partner() : options.partner) as never),
        updateTaxStatus: (_tx, partnerId, status) => {
          statusWrites.push({ partnerId, status });
          return Promise.resolve({} as PartnerRecord);
        },
      }),
      fakePort<IPartnerTaxRepository>({
        listActiveThresholdRules: () => Promise.resolve([RULE]),
        ensureAssessment: () => Promise.resolve(row),
        lockAssessment: () => Promise.resolve(row),
        createDeclaration: (_tx, args) => {
          declarations.push(args);
          return Promise.resolve();
        },
        sumPlatformRevenue: () => Promise.resolve(options.platformRevenue ?? 10_000_000n),
        updateAssessment: (_tx, _id, update) => {
          updates.push(update);
          return Promise.resolve({ ...row, ...update });
        },
      }),
      fakePort<IAuditWriter>({
        write: (_tx, entry) => {
          audits.push(entry);
          return Promise.resolve();
        },
      }),
      new OutboxService(),
      tenantDb.service,
    ),
    declarations,
    updates,
    statusWrites,
    audits,
    events,
  };
}

const input = (overrides: Partial<RecordPartnerTaxDeclarationInput> = {}) =>
  ({ taxYear: 2026, externalRevenue: '50000000', ...overrides }) as RecordPartnerTaxDeclarationInput;

describe('RecordPartnerTaxDeclarationUseCase', () => {
  it('answers not-found for an unknown partner', async () => {
    const { useCase, declarations } = harness({ partner: null });

    await expect(
      useCase.execute(TENANT_ID, PARTNER_ID, input(), ACTOR),
    ).rejects.toBeInstanceOf(PartnerNotFound);
    expect(declarations).toEqual([]);
  });

  it('refuses for a partner the household threshold does not apply to', async () => {
    const { useCase, declarations } = harness({ partner: partner({ taxStatus: 'company_vat' }) });

    await expect(
      useCase.execute(TENANT_ID, PARTNER_ID, input(), ACTOR),
    ).rejects.toBeInstanceOf(PartnerTaxAssessmentNotApplicable);
    expect(declarations).toEqual([]);
  });

  it('REFUSES a declaration for a year that has not happened', async () => {
    // Revenue cannot be declared before it can be earned.
    const { useCase, declarations } = harness();

    await expect(
      useCase.execute(TENANT_ID, PARTNER_ID, input({ taxYear: 2027 }), ACTOR),
    ).rejects.toBeInstanceOf(FutureTaxYearDeclaration);
    expect(declarations).toEqual([]);
  });

  it('parses the declared revenue as BIGINT', async () => {
    // A VND figure can exceed 2^53, and this one feeds the threshold comparison.
    const { useCase, declarations } = harness();

    await useCase.execute(
      TENANT_ID,
      PARTNER_ID,
      input({ externalRevenue: '9007199254740993' }),
      ACTOR,
    );

    expect(declarations[0]).toMatchObject({ externalRevenue: 9007199254740993n });
  });

  it('stamps the declaration with the DATABASE clock and the declaring user', async () => {
    const { useCase, declarations } = harness();

    await useCase.execute(TENANT_ID, PARTNER_ID, input({ note: 'Doanh thu chợ' }), ACTOR);

    expect(declarations).toEqual([
      {
        tenantId: TENANT_ID,
        partnerId: PARTNER_ID,
        assessmentId: 'assessment-1',
        externalRevenue: 50_000_000n,
        declaredByUserId: ACTOR,
        note: 'Doanh thu chợ',
        declaredAt: DB_NOW,
      },
    ]);
  });

  it('stores an absent note as null', async () => {
    const { useCase, declarations } = harness();

    await useCase.execute(TENANT_ID, PARTNER_ID, input(), ACTOR);

    expect(declarations[0]).toMatchObject({ note: null });
  });

  it('marks the assessment as declared, sourced from the DECLARATION', async () => {
    // Without the timestamp the partner stays in `missing_declaration` and the
    // conservative declaring regime forever.
    const { useCase, updates } = harness();

    await useCase.execute(TENANT_ID, PARTNER_ID, input(), ACTOR);

    expect(updates[0]).toMatchObject({
      declarationUpdatedAt: DB_NOW,
      classificationSource: 'external_declaration',
      externalRevenue: 50_000_000n,
      status: 'below_threshold',
    });
  });

  it('CROSSES the threshold when platform plus declared revenue exceeds it', async () => {
    const { useCase, updates, statusWrites, events } = harness({
      platformRevenue: 180_000_000n,
    });

    await useCase.execute(TENANT_ID, PARTNER_ID, input({ externalRevenue: '30000000' }), ACTOR);

    expect(updates[0]).toMatchObject({
      status: 'exceeded',
      crossedAt: DB_NOW,
      crossedQuarter: 3,
    });
    expect(statusWrites).toEqual([{ partnerId: PARTNER_ID, status: 'household_declaring' }]);
    expect(events[0]?.payload).toMatchObject({ reason: 'external_declaration' });
  });

  it('does NOT reclassify the partner on a back-year declaration', async () => {
    // The partner's live status describes this year; a 2025 filing must not
    // change what today's quotes charge.
    const { useCase, statusWrites, events } = harness({ platformRevenue: 180_000_000n });

    const result = await useCase.execute(
      TENANT_ID,
      PARTNER_ID,
      input({ taxYear: 2025, externalRevenue: '30000000' }),
      ACTOR,
    );

    expect(statusWrites).toEqual([]);
    expect(events).toEqual([]);
    expect(result.taxStatus).toBe('household_below_threshold');
  });

  it('does not stamp a back-year crossing with THIS year’s quarter', async () => {
    const { useCase, updates } = harness({ platformRevenue: 180_000_000n });

    await useCase.execute(
      TENANT_ID,
      PARTNER_ID,
      input({ taxYear: 2025, externalRevenue: '30000000' }),
      ACTOR,
    );

    expect(updates[0]).toMatchObject({ status: 'exceeded', crossedQuarter: null });
  });

  it('keeps a manual override in force over the declaration', async () => {
    const { useCase, updates, statusWrites } = harness({
      platformRevenue: 180_000_000n,
      assessment: assessment({
        manualOverrideStatus: 'household_below_threshold',
        manualOverrideUntil: new Date('2026-12-31T00:00:00Z'),
      }),
    });

    await useCase.execute(TENANT_ID, PARTNER_ID, input({ externalRevenue: '30000000' }), ACTOR);

    expect(updates[0]).toMatchObject({ classificationSource: 'manual_override' });
    expect(statusWrites).toEqual([]);
  });

  it('records the declaration in the audit trail as a STRING amount', async () => {
    // Audit payloads are JSON; a bigint would not survive serialisation.
    const { useCase, audits } = harness();

    await useCase.execute(TENANT_ID, PARTNER_ID, input(), ACTOR);

    expect(audits).toEqual([
      {
        tenantId: TENANT_ID,
        actorUserId: ACTOR,
        action: 'partner.tax_revenue_declared',
        entityType: 'partner_tax_year_assessment',
        entityId: 'assessment-1',
        data: { taxYear: 2026, externalRevenue: '50000000' },
      },
    ]);
  });
});
