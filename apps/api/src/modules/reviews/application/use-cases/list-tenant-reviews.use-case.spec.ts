import { describe, expect, it } from 'vitest';
import type { TenantReviewsQuery } from '@booking/contracts';
import { fakePort, fakeTenantDb } from '~testing';
import type { IReviewRepository } from '../../domain/ports/review-repository.port';
import { ListTenantReviewsUseCase } from './list-tenant-reviews.use-case';

const PAGE = { items: [], total: 0 } as never;

describe('ListTenantReviewsUseCase', () => {
  it('lists the tenant’s reviews inside its own transaction', async () => {
    const seen: unknown[] = [];
    const tenantDb = fakeTenantDb();
    const useCase = new ListTenantReviewsUseCase(
      fakePort<IReviewRepository>({
        listTenant: (_tx, query) => {
          seen.push(query);
          return Promise.resolve(PAGE);
        },
      }),
      tenantDb.service,
    );

    const query = { page: 2, pageSize: 20, rating: 1 } as unknown as TenantReviewsQuery;
    await useCase.execute('tenant-1', query);

    expect(tenantDb.openedFor).toEqual(['tenant-1']);
    expect(seen).toEqual([query]);
  });
});
