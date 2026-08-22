import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import { TenantNotFound } from '../../../../shared/domain/errors/tenant-not-found';
import type { IFavoriteReader } from '../../domain/ports/favorite-reader.port';
import type { IFavoriteTenantReader } from '../../domain/ports/favorite-tenant-reader.port';
import { ListFavoriteRefsUseCase } from './list-favorite-refs.use-case';

const HOST = 'studiohub.localhost';
const TENANT_ID = 'tenant-1';
const CUSTOMER_ID = 'customer-1';

function harness(tenantId: string | null = TENANT_ID) {
  const asked: string[] = [];
  const refs = { listingIds: [], groupIds: [] } as never;
  const tenantDb = fakeTenantDb();
  return {
    useCase: new ListFavoriteRefsUseCase(
      fakePort<IFavoriteReader>({
        listRefs: (_tx, customerId) => {
          asked.push(customerId);
          return Promise.resolve(refs);
        },
      }),
      fakePort<IFavoriteTenantReader>({ resolveTenantId: () => Promise.resolve(tenantId) }),
      tenantDb.service,
    ),
    tenantDb,
    asked,
    refs,
  };
}

describe('ListFavoriteRefsUseCase', () => {
  it('refuses a host that resolves to no tenant', async () => {
    const { useCase } = harness(null);

    await expect(useCase.execute(HOST, CUSTOMER_ID)).rejects.toBeInstanceOf(TenantNotFound);
  });

  it('reads only this customer hearts, scoped to the host tenant', async () => {
    // The same person can hold an account on two tenants; the heart state on one
    // storefront must not light up on the other.
    const { useCase, tenantDb, asked, refs } = harness();

    await expect(useCase.execute(HOST, CUSTOMER_ID)).resolves.toBe(refs);
    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(asked).toEqual([CUSTOMER_ID]);
  });
});
