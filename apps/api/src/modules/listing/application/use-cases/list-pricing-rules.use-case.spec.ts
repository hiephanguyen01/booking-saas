import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import type {
  IPricingRuleRepository,
  PricingRuleRecord,
} from '../../domain/ports/pricing-rule-repository.port';
import { ListPricingRulesUseCase } from './list-pricing-rules.use-case';

const TENANT_ID = 'tenant-1';
const LISTING_ID = 'listing-1';

describe('ListPricingRulesUseCase', () => {
  it('lists the rules of one listing inside the tenant transaction', async () => {
    const asked: string[] = [];
    const rows = [] as PricingRuleRecord[];
    const tenantDb = fakeTenantDb();
    const useCase = new ListPricingRulesUseCase(
      fakePort<IPricingRuleRepository>({
        listByListing: (_tx, listingId) => {
          asked.push(listingId);
          return Promise.resolve(rows);
        },
      }),
      tenantDb.service,
    );

    await expect(useCase.execute(TENANT_ID, LISTING_ID)).resolves.toBe(rows);
    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(asked).toEqual([LISTING_ID]);
  });
});
