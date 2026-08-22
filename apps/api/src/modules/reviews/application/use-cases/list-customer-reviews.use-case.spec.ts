import { describe, expect, it } from 'vitest';
import type { CustomerReviewsQuery } from '@booking/contracts';
import { fakePort, fakeTenantDb } from '~testing';
import { TenantNotFound } from '../../../../shared/domain/errors/tenant-not-found';
import type { IReviewRepository } from '../../domain/ports/review-repository.port';
import type { IReviewTenantReader } from '../../domain/ports/review-tenant-reader.port';
import { ListCustomerReviewsUseCase } from './list-customer-reviews.use-case';

const PAGE = { items: [], total: 0 } as never;

function harness(tenantId: string | null = 'tenant-9') {
  const seen: Array<{ customerId: string; query: unknown }> = [];
  const tenantDb = fakeTenantDb();
  return {
    useCase: new ListCustomerReviewsUseCase(
      fakePort<IReviewRepository>({
        listCustomer: (_tx, customerId, query) => {
          seen.push({ customerId, query });
          return Promise.resolve(PAGE);
        },
      }),
      fakePort<IReviewTenantReader>({ resolveTenantId: () => Promise.resolve(tenantId) }),
      tenantDb.service,
    ),
    tenantDb,
    seen,
  };
}

describe('ListCustomerReviewsUseCase', () => {
  it('answers not-found for an unknown host', async () => {
    const { useCase } = harness(null);

    await expect(
      useCase.execute('nope.vn', 'user-1', {} as CustomerReviewsQuery),
    ).rejects.toBeInstanceOf(TenantNotFound);
  });

  it("lists only the CALLING customer's own reviews", async () => {
    // Anyone else's would be a privacy leak on an authenticated account page.
    const { useCase, seen, tenantDb } = harness();
    const query = { page: 2, pageSize: 20 } as CustomerReviewsQuery;

    await useCase.execute('studiohub.vn', 'user-1', query);

    expect(tenantDb.openedFor).toEqual(['tenant-9']);
    expect(seen).toEqual([{ customerId: 'user-1', query }]);
  });
});
