import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import type { ICommissionCoverageReader } from '../../domain/ports/commission-coverage-reader.port';
import { GetListingDepositRequirementUseCase } from './get-listing-deposit-requirement.use-case';

const TENANT_ID = 'tenant-1';
const PARTNER_ID = 'partner-1';
const LISTING_TYPE_ID = 'type-1';

function harness(rule: unknown) {
  const targets: unknown[] = [];
  const tenantDb = fakeTenantDb();
  return {
    useCase: new GetListingDepositRequirementUseCase(
      fakePort<ICommissionCoverageReader>({
        findEffectiveRule: (_tx, target) => {
          targets.push(target);
          return Promise.resolve(rule as never);
        },
      }),
      tenantDb.service,
    ),
    tenantDb,
    targets,
  };
}

describe('GetListingDepositRequirementUseCase', () => {
  it('reports the tenant commission percent as the minimum deposit', async () => {
    // The deposit has to cover the tenant's cut, or the tenant ends up owing money
    // it never collected — so the form needs this number before the partner types.
    const { useCase, tenantDb, targets } = harness({
      id: 'rule-1',
      rateType: 'percent',
      rate: 15n,
    });

    await expect(
      useCase.execute(TENANT_ID, PARTNER_ID, LISTING_TYPE_ID, 'category-1'),
    ).resolves.toEqual({ minimumDepositPercent: 15, commissionRuleId: 'rule-1' });
    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(targets).toEqual([
      { partnerId: PARTNER_ID, listingTypeId: LISTING_TYPE_ID, categoryId: 'category-1' },
    ]);
  });

  it('imposes no minimum when the tenant charges a FIXED commission', async () => {
    // A fixed đồng amount cannot be compared against a percentage, so the guard
    // does not apply rather than guessing an equivalent.
    const { useCase } = harness({ id: 'rule-1', rateType: 'fixed', rate: 50_000n });

    await expect(useCase.execute(TENANT_ID, PARTNER_ID, LISTING_TYPE_ID, null)).resolves.toEqual({
      minimumDepositPercent: null,
      commissionRuleId: null,
    });
  });

  it('imposes no minimum when no rule matches at all', async () => {
    const { useCase } = harness(null);

    await expect(useCase.execute(TENANT_ID, PARTNER_ID, LISTING_TYPE_ID, null)).resolves.toEqual({
      minimumDepositPercent: null,
      commissionRuleId: null,
    });
  });
});
