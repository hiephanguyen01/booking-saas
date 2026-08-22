import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import type { IListingRepository, ListingFilter } from '../../domain/ports/listing-repository.port';
import { ListListingsUseCase } from './list-listings.use-case';

const TENANT_ID = 'tenant-1';

describe('ListListingsUseCase', () => {
  it('carries the partner scope in the filter it hands the repository', async () => {
    // The partner-facing list and the tenant-wide one share this repository call;
    // `filter.partnerId` is the only thing separating them.
    const calls: ListingFilter[] = [];
    const result = { items: [], total: 0, counts: {} };
    const tenantDb = fakeTenantDb();
    const useCase = new ListListingsUseCase(
      fakePort<IListingRepository>({
        listPage: (_tx, filter) => {
          calls.push(filter);
          return Promise.resolve(result as never);
        },
      }),
      tenantDb.service,
    );

    const filter = { partnerId: 'partner-1', status: 'published', q: 'studio' } as ListingFilter;
    await expect(useCase.execute(TENANT_ID, filter, { page: 1, pageSize: 20 })).resolves.toBe(
      result,
    );
    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(calls).toEqual([filter]);
  });
});
