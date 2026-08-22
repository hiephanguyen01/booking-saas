import { describe, expect, it } from 'vitest';
import type { UpdateCommissionRuleInput } from '@booking/contracts';
import { fakePort, fakeTenantDb, fakeTx } from '~testing';
import {
  CommissionExceedsPartnerDeposit,
  CommissionRatesNegativeTenant,
  CommissionRuleNotFound,
} from '../../domain/errors/finance-domain-errors';
import type {
  CommissionRuleRecord,
  ICommissionRuleRepository,
} from '../../domain/ports/commission-rule-repository.port';
import { UpdateCommissionRuleUseCase } from './update-commission-rule.use-case';

const TENANT_ID = 'tenant-1';
const RULE_ID = 'rule-1';
const HOUSE_PARTNER_ID = 'partner-house';

const rule = (overrides: Partial<CommissionRuleRecord> = {}): CommissionRuleRecord =>
  ({
    id: RULE_ID,
    tenantId: TENANT_ID,
    appliesTo: 'listing_type',
    listingTypeId: 'type-1',
    categoryId: null,
    partnerId: null,
    tenantRateType: 'percent',
    tenantRate: 15n,
    platformRate: 3,
    affiliateRateType: 'percent',
    affiliateRate: 2n,
    effectiveFrom: null,
    effectiveTo: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  }) as CommissionRuleRecord;

function harness(found: CommissionRuleRecord | null, incompatibleCount = 0) {
  const patches: unknown[] = [];
  const candidates: unknown[] = [];
  const tx = fakeTx({
    partner: {
      findFirst: (args: { where: { id: string } }) =>
        Promise.resolve({ isHouse: args.where.id === HOUSE_PARTNER_ID }),
    },
  });
  const tenantDb = fakeTenantDb({ tx });
  return {
    useCase: new UpdateCommissionRuleUseCase(
      fakePort<ICommissionRuleRepository>({
        findById: () => Promise.resolve(found),
        findIncompatibleListingsForRule: (_tx, candidate, excludeId) => {
          candidates.push({ candidate, excludeId });
          return Promise.resolve({ count: incompatibleCount, samples: [] });
        },
        update: (_tx, _id, patch) => {
          patches.push(patch);
          return Promise.resolve(rule());
        },
      }),
      tenantDb.service,
    ),
    tenantDb,
    patches,
    candidates,
  };
}

describe('UpdateCommissionRuleUseCase', () => {
  it('answers 404 for a rule this tenant does not have', async () => {
    const { useCase, patches } = harness(null);

    await expect(
      useCase.execute(TENANT_ID, RULE_ID, { tenantRate: '20' } as UpdateCommissionRuleInput),
    ).rejects.toBeInstanceOf(CommissionRuleNotFound);
    expect(patches).toEqual([]);
  });

  it('re-checks the floor against the MERGED rule, not the patch alone', async () => {
    // Raising the affiliate rate alone is only legal in the context of the tenant
    // rate already stored; the candidate is what gets validated.
    const { useCase, patches } = harness(rule());

    await expect(
      useCase.execute(TENANT_ID, RULE_ID, { affiliateRate: '14' } as UpdateCommissionRuleInput),
    ).rejects.toBeInstanceOf(CommissionRatesNegativeTenant);
    expect(patches).toEqual([]);
  });

  it('keeps the stored platform fee — it is not editable here', async () => {
    const { useCase, candidates } = harness(rule({ platformRate: 7 }));

    await useCase.execute(TENANT_ID, RULE_ID, {
      tenantRate: '30',
      platformRate: 99,
    } as unknown as UpdateCommissionRuleInput);

    expect((candidates[0] as { candidate: { platformRate: number } }).candidate.platformRate).toBe(
      7,
    );
  });

  it('excludes the rule being edited from the deposit-coverage check', async () => {
    // Otherwise a rule always conflicts with the listings it already governs.
    const { useCase, candidates } = harness(rule());

    await useCase.execute(TENANT_ID, RULE_ID, { tenantRate: '20' } as UpdateCommissionRuleInput);

    expect((candidates[0] as { excludeId: string }).excludeId).toBe(RULE_ID);
  });

  it('waives the floor when the rule now targets a house partner', async () => {
    const { useCase, patches } = harness(rule());

    await useCase.execute(TENANT_ID, RULE_ID, {
      appliesTo: 'partner',
      partnerId: HOUSE_PARTNER_ID,
      tenantRate: '1',
      affiliateRate: '14',
    } as UpdateCommissionRuleInput);

    expect(patches).toHaveLength(1);
  });

  it('refuses a change that would outgrow an existing deposit', async () => {
    const { useCase, patches } = harness(rule(), 2);

    await expect(
      useCase.execute(TENANT_ID, RULE_ID, { tenantRate: '20' } as UpdateCommissionRuleInput),
    ).rejects.toBeInstanceOf(CommissionExceedsPartnerDeposit);
    expect(patches).toEqual([]);
  });

  it('writes only the fields the caller actually sent', async () => {
    const { useCase, tenantDb, patches } = harness(rule());

    await useCase.execute(TENANT_ID, RULE_ID, { tenantRate: '20' } as UpdateCommissionRuleInput);

    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(patches[0]).toEqual({ tenantRate: 20n });
  });
});
