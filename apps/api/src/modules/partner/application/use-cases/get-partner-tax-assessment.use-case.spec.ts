import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import type { TaxThresholdRule } from '../../../../shared/domain/tax/threshold';
import {
  PartnerNotFound,
  PartnerTaxAssessmentNotApplicable,
} from '../../domain/errors/partner-errors';
import { TaxThresholdRuleUnavailable } from '../partner-http-errors';
import type {
  IPartnerRepository,
  PartnerRecord,
} from '../../domain/ports/partner-repository.port';
import type {
  IPartnerTaxRepository,
  PartnerTaxAssessmentRecord,
} from '../../domain/ports/partner-tax-repository.port';
import { GetPartnerTaxAssessmentUseCase } from './get-partner-tax-assessment.use-case';

const TENANT_ID = 'tenant-1';
const PARTNER_ID = 'partner-1';
/** 2026-08-19 in Asia/Ho_Chi_Minh — tax year 2026. */
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
  ({
    id: PARTNER_ID,
    isHouse: false,
    taxStatus: 'household_below_threshold',
    ...overrides,
  }) as unknown as PartnerRecord;

const ASSESSMENT = { id: 'assessment-1', taxYear: 2026 } as PartnerTaxAssessmentRecord;

function harness(options: { partner?: PartnerRecord | null; rules?: TaxThresholdRule[] } = {}) {
  const ensured: unknown[] = [];
  const tenantDb = fakeTenantDb({ now: DB_NOW });
  return {
    useCase: new GetPartnerTaxAssessmentUseCase(
      fakePort<IPartnerRepository>({
        findById: () =>
          Promise.resolve(options.partner === undefined ? partner() : options.partner),
      }),
      fakePort<IPartnerTaxRepository>({
        listActiveThresholdRules: () => Promise.resolve(options.rules ?? [RULE]),
        ensureAssessment: (_tx, args) => {
          ensured.push(args);
          return Promise.resolve(ASSESSMENT);
        },
      }),
      tenantDb.service,
    ),
    tenantDb,
    ensured,
  };
}

describe('GetPartnerTaxAssessmentUseCase', () => {
  it('answers not-found for an unknown partner', async () => {
    const { useCase } = harness({ partner: null });

    await expect(
      useCase.execute(TENANT_ID, PARTNER_ID),
    ).rejects.toBeInstanceOf(PartnerNotFound);
  });

  it('refuses for a partner the household threshold does not apply to', async () => {
    // A company invoices its own VAT; there is no assessment to show, and an
    // empty one would read as "under the threshold".
    const company = harness({ partner: partner({ taxStatus: 'company_vat' }) });
    const house = harness({ partner: partner({ isHouse: true }) });

    await expect(company.useCase.execute(TENANT_ID, PARTNER_ID)).rejects.toBeInstanceOf(
      PartnerTaxAssessmentNotApplicable,
    );
    await expect(house.useCase.execute(TENANT_ID, PARTNER_ID)).rejects.toBeInstanceOf(
      PartnerTaxAssessmentNotApplicable,
    );
  });

  it('defaults to the CURRENT Vietnam tax year', async () => {
    const { useCase, ensured } = harness();

    await useCase.execute(TENANT_ID, PARTNER_ID);

    expect(ensured).toEqual([
      {
        tenantId: TENANT_ID,
        partnerId: PARTNER_ID,
        taxYear: 2026,
        thresholdRuleId: RULE.id,
        thresholdAmount: RULE.thresholdAmount,
        initialStatus: 'missing_declaration',
      },
    ]);
  });

  it('honours an explicitly requested year', async () => {
    const { useCase, ensured } = harness();

    await useCase.execute(TENANT_ID, PARTNER_ID, 2025);

    expect(ensured[0]).toMatchObject({ taxYear: 2025 });
  });

  it('CREATES the assessment on first read rather than answering nothing', async () => {
    // The dashboard needs a row to render even before any settlement has landed.
    const { useCase, tenantDb } = harness();

    const result = await useCase.execute(TENANT_ID, PARTNER_ID);

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(result).toEqual({
      assessment: ASSESSMENT,
      taxStatus: 'household_below_threshold',
    });
  });

  it('refuses when the platform has no active threshold rule for that year', async () => {
    // Inventing a threshold would classify partners against a number with no
    // legal reference behind it.
    const { useCase } = harness({ rules: [] });

    await expect(useCase.execute(TENANT_ID, PARTNER_ID)).rejects.toBeInstanceOf(
      TaxThresholdRuleUnavailable,
    );
  });

  it('picks the HIGHEST-revision rule effective for that year', async () => {
    const { useCase, ensured } = harness({
      rules: [
        RULE,
        { ...RULE, id: 'rule-revised', thresholdAmount: 500_000_000n, revision: 2 },
      ],
    });

    await useCase.execute(TENANT_ID, PARTNER_ID);

    expect(ensured[0]).toMatchObject({
      thresholdRuleId: 'rule-revised',
      thresholdAmount: 500_000_000n,
    });
  });
});
