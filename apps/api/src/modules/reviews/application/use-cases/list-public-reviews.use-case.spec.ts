import { describe, expect, it } from 'vitest';
import type { PublicReviewsQuery } from '@booking/contracts';
import { fakePort, fakeTenantDb } from '~testing';
import { TenantNotFound } from '../../../../shared/domain/errors/tenant-not-found';
import { ReviewTargetNotFound } from '../../domain/errors/review-errors';
import type { IReviewRepository, ReviewPage } from '../../domain/ports/review-repository.port';
import type { IReviewTenantReader } from '../../domain/ports/review-tenant-reader.port';
import { ListPublicReviewsUseCase } from './list-public-reviews.use-case';

const PAGE = { items: [], total: 0 } as unknown as ReviewPage;

function harness(options: { tenantId?: string | null; page?: ReviewPage | null } = {}) {
  const queries: unknown[] = [];
  const tenantDb = fakeTenantDb();
  return {
    useCase: new ListPublicReviewsUseCase(
      fakePort<IReviewRepository>({
        listPublic: (_tx, query) => {
          queries.push(query);
          return Promise.resolve(options.page === undefined ? PAGE : options.page);
        },
      }),
      fakePort<IReviewTenantReader>({
        resolveTenantId: () =>
          Promise.resolve(options.tenantId === undefined ? 'tenant-9' : options.tenantId),
      }),
      tenantDb.service,
    ),
    tenantDb,
    queries,
  };
}

const query = { listingId: 'listing-1', page: 1, pageSize: 20 } as unknown as PublicReviewsQuery;

describe('ListPublicReviewsUseCase', () => {
  it('answers not-found for an unknown host', async () => {
    const { useCase } = harness({ tenantId: null });

    await expect(useCase.execute('nope.vn', query)).rejects.toBeInstanceOf(TenantNotFound);
  });

  it('tells a MISSING target apart from a target with no reviews', async () => {
    // A null page means the listing or group does not exist; an empty page means
    // nobody has reviewed it yet, and those are different answers.
    const { useCase } = harness({ page: null });

    await expect(useCase.execute('studiohub.vn', query)).rejects.toBeInstanceOf(
      ReviewTargetNotFound,
    );
  });

  it('reads inside the resolved tenant with the query intact', async () => {
    const { useCase, queries, tenantDb } = harness();

    const result = await useCase.execute('studiohub.vn', query);

    expect(tenantDb.openedFor).toEqual(['tenant-9']);
    expect(queries).toEqual([query]);
    expect(result).toBe(PAGE);
  });
});
