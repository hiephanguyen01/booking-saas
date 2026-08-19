import { describe, expect, it } from 'vitest';
import type { FavoriteTarget } from '@booking/contracts';
import { fakePort, fakeTenantDb } from '~testing';
import { TenantNotFound } from '../../../../shared/domain/errors/tenant-not-found';
import type { IFavoriteRepository } from '../../domain/ports/favorite-repository.port';
import type { IFavoriteTenantReader } from '../../domain/ports/favorite-tenant-reader.port';
import { RemoveFavoriteUseCase } from './remove-favorite.use-case';

const HOST = 'studiohub.localhost';
const TENANT_ID = 'tenant-1';
const CUSTOMER_ID = 'customer-1';
const target = { target: 'listing', targetId: 'listing-1' } as unknown as FavoriteTarget;

function harness(tenantId: string | null = TENANT_ID) {
  const removed: Array<{ customerId: string; target: FavoriteTarget }> = [];
  const tenantDb = fakeTenantDb();
  return {
    useCase: new RemoveFavoriteUseCase(
      fakePort<IFavoriteRepository>({
        remove: (_tx, customerId, removedTarget) => {
          removed.push({ customerId, target: removedTarget });
          return Promise.resolve();
        },
      }),
      fakePort<IFavoriteTenantReader>({ resolveTenantId: () => Promise.resolve(tenantId) }),
      tenantDb.service,
    ),
    tenantDb,
    removed,
  };
}

describe('RemoveFavoriteUseCase', () => {
  it('refuses a host that resolves to no tenant', async () => {
    const { useCase } = harness(null);

    await expect(useCase.execute(HOST, CUSTOMER_ID, target)).rejects.toBeInstanceOf(TenantNotFound);
  });

  it('removes the heart for this customer only, and reports the state', async () => {
    // Unlike add, there is no favouritability check: un-hearting something that
    // has since been unpublished must still work.
    const { useCase, tenantDb, removed } = harness();

    await expect(useCase.execute(HOST, CUSTOMER_ID, target)).resolves.toEqual({
      ...target,
      favorited: false,
    });
    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(removed).toEqual([{ customerId: CUSTOMER_ID, target }]);
  });
});
