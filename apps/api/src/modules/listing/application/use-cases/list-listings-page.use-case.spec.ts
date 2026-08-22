import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import type { IListingRepository, ListingFilter } from '../../domain/ports/listing-repository.port';
import { ListListingsPageUseCase } from './list-listings-page.use-case';

const TENANT_ID = 'tenant-1';

describe('ListListingsPageUseCase', () => {
  it('pages across every partner and returns the per-status counts', async () => {
    // A tenant accumulates listings without bound, so this read is always paged —
    // and the tab counts come back with the page rather than as a second request.
    const calls: Array<{ filter: ListingFilter; page: unknown }> = [];
    const result = { items: [], total: 0, counts: { published: 3 } };
    const tenantDb = fakeTenantDb();
    const useCase = new ListListingsPageUseCase(
      fakePort<IListingRepository>({
        listPage: (_tx, filter, page) => {
          calls.push({ filter, page });
          return Promise.resolve(result as never);
        },
      }),
      tenantDb.service,
    );

    const filter = { status: 'published' } as ListingFilter;
    await expect(useCase.execute(TENANT_ID, filter, { page: 3, pageSize: 50 })).resolves.toBe(
      result,
    );
    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(calls[0]?.filter).not.toHaveProperty('partnerId');
    expect(calls[0]?.page).toEqual({ page: 3, pageSize: 50 });
  });
});
