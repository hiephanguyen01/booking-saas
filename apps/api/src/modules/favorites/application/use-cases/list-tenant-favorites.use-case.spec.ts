import { describe, expect, it } from 'vitest';
import type { TenantFavoritesQuery } from '@booking/contracts';
import { fakePort, fakeTenantDb } from '~testing';
import type { IFavoriteReader } from '../../domain/ports/favorite-reader.port';
import { ListTenantFavoritesUseCase } from './list-tenant-favorites.use-case';

const TENANT_ID = 'tenant-1';

describe('ListTenantFavoritesUseCase', () => {
  it('reads across every partner, passing NO partner filter', async () => {
    // Deliberately unfiltered: this is the tenant-wide view. RLS is what keeps it
    // inside the tenant.
    const calls: Array<{ partnerId?: string }> = [];
    const page = { items: [], total: 0 } as never;
    const tenantDb = fakeTenantDb();
    const useCase = new ListTenantFavoritesUseCase(
      fakePort<IFavoriteReader>({
        listDashboard: (_tx, _query, partnerId) => {
          calls.push({ partnerId });
          return Promise.resolve(page);
        },
      }),
      tenantDb.service,
    );

    await expect(
      useCase.execute(TENANT_ID, { page: 1, pageSize: 20 } as TenantFavoritesQuery),
    ).resolves.toBe(page);
    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(calls).toEqual([{ partnerId: undefined }]);
  });
});
