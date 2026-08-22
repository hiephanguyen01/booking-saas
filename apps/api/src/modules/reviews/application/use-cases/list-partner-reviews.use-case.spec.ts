import { describe, expect, it } from 'vitest';
import type { PartnerReviewsQuery } from '@booking/contracts';
import { fakePort, fakeTenantDb } from '~testing';
import type { IReviewRepository } from '../../domain/ports/review-repository.port';
import { ListPartnerReviewsUseCase } from './list-partner-reviews.use-case';

const PAGE = { items: [], total: 0 } as never;

describe('ListPartnerReviewsUseCase', () => {
  it("lists only THIS partner's reviews, with the query intact", async () => {
    // RLS scopes the tenant, not the partner, so the id has to reach the query.
    const seen: Array<{ partnerId: string; query: unknown }> = [];
    const tenantDb = fakeTenantDb();
    const useCase = new ListPartnerReviewsUseCase(
      fakePort<IReviewRepository>({
        listPartner: (_tx, partnerId, query) => {
          seen.push({ partnerId, query });
          return Promise.resolve(PAGE);
        },
      }),
      tenantDb.service,
    );

    const query = { page: 2, pageSize: 20 } as PartnerReviewsQuery;
    await useCase.execute('tenant-1', 'partner-1', query);

    expect(tenantDb.openedFor).toEqual(['tenant-1']);
    expect(seen).toEqual([{ partnerId: 'partner-1', query }]);
  });
});
