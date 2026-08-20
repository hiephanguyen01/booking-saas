import { describe, expect, it } from 'vitest';
import type { ListAffiliateCommissionsQuery } from '@booking/contracts';
import { fakePort, fakeTenantDb } from '~testing';
import type { IAffiliateCommissionReader } from '../../domain/ports/affiliate-commission-reader.port';
import { ListAffiliateCommissionsUseCase } from './list-affiliate-commissions.use-case';

const PAGE = { items: [], total: 0 } as never;

describe('ListAffiliateCommissionsUseCase', () => {
  it('lists THIS affiliate’s commissions with the query intact', async () => {
    const seen: Array<{ affiliateId: string; query: unknown }> = [];
    const tenantDb = fakeTenantDb();
    const useCase = new ListAffiliateCommissionsUseCase(
      fakePort<IAffiliateCommissionReader>({
        listByAffiliatePaginated: (_tx, affiliateId, query) => {
          seen.push({ affiliateId, query });
          return Promise.resolve(PAGE);
        },
      }),
      tenantDb.service,
    );

    const query = { page: 2, pageSize: 50, status: 'confirmed' } as ListAffiliateCommissionsQuery;
    const result = await useCase.execute('tenant-1', 'affiliate-1', query);

    expect(tenantDb.openedFor).toEqual(['tenant-1']);
    expect(seen).toEqual([{ affiliateId: 'affiliate-1', query }]);
    expect(result).toBe(PAGE);
  });
});
