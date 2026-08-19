import { describe, expect, it } from 'vitest';
import type { CustomerFavoritesQuery } from '@booking/contracts';
import { fakePort, fakeTenantDb } from '~testing';
import { TenantNotFound } from '../../../../shared/domain/errors/tenant-not-found';
import type { IFavoriteReader } from '../../domain/ports/favorite-reader.port';
import type { IFavoriteTenantReader } from '../../domain/ports/favorite-tenant-reader.port';
import { ListCustomerFavoritesUseCase } from './list-customer-favorites.use-case';

const HOST = 'studiohub.localhost';
const TENANT_ID = 'tenant-1';
const CUSTOMER_ID = 'customer-1';

function harness(tenantId: string | null = TENANT_ID) {
  const calls: Array<{ customerId: string; query: CustomerFavoritesQuery }> = [];
  const page = { items: [], total: 0 } as never;
  const tenantDb = fakeTenantDb();
  return {
    useCase: new ListCustomerFavoritesUseCase(
      fakePort<IFavoriteReader>({
        listCustomer: (_tx, customerId, query) => {
          calls.push({ customerId, query });
          return Promise.resolve(page);
        },
      }),
      fakePort<IFavoriteTenantReader>({ resolveTenantId: () => Promise.resolve(tenantId) }),
      tenantDb.service,
    ),
    tenantDb,
    calls,
    page,
  };
}

describe('ListCustomerFavoritesUseCase', () => {
  it('refuses a host that resolves to no tenant', async () => {
    const { useCase } = harness(null);

    await expect(
      useCase.execute(HOST, CUSTOMER_ID, { page: 1, pageSize: 20 } as CustomerFavoritesQuery),
    ).rejects.toBeInstanceOf(TenantNotFound);
  });

  it('pages this customer favourites within the host tenant', async () => {
    const { useCase, tenantDb, calls, page } = harness();
    const query = { page: 2, pageSize: 12 } as CustomerFavoritesQuery;

    await expect(useCase.execute(HOST, CUSTOMER_ID, query)).resolves.toBe(page);
    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(calls).toEqual([{ customerId: CUSTOMER_ID, query }]);
  });
});
