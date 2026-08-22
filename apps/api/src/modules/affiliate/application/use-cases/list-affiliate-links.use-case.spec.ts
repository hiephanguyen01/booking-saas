import { describe, expect, it } from 'vitest';
import type { ListAffiliateLinksQuery } from '@booking/contracts';
import { fakePort, fakeTenantDb } from '~testing';
import type { IReferralLinkReader } from '../../domain/ports/referral-link-reader.port';
import { ListAffiliateLinksUseCase } from './list-affiliate-links.use-case';

const PAGE = { items: [], total: 0 } as never;

describe('ListAffiliateLinksUseCase', () => {
  it('lists THIS affiliate’s links with the query intact', async () => {
    // Referral codes are the affiliate's earning surface; listing another's
    // would hand over their codes.
    const seen: Array<{ affiliateId: string; query: unknown }> = [];
    const tenantDb = fakeTenantDb();
    const useCase = new ListAffiliateLinksUseCase(
      fakePort<IReferralLinkReader>({
        listByAffiliatePaginated: (_tx, affiliateId, query) => {
          seen.push({ affiliateId, query });
          return Promise.resolve(PAGE);
        },
      }),
      tenantDb.service,
    );

    const query = { page: 2, pageSize: 50 } as ListAffiliateLinksQuery;
    const result = await useCase.execute('tenant-1', 'affiliate-1', query);

    expect(tenantDb.openedFor).toEqual(['tenant-1']);
    expect(seen).toEqual([{ affiliateId: 'affiliate-1', query }]);
    expect(result).toBe(PAGE);
  });
});
