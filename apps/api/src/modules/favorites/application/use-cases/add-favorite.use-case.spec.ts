import { describe, expect, it } from 'vitest';
import type { FavoriteTarget } from '@booking/contracts';
import { fakePort, fakeTenantDb } from '~testing';
import { TenantNotFound } from '../../../../shared/domain/errors/tenant-not-found';
import { FavoriteTargetNotFound } from '../../domain/errors/favorite-errors';
import type { IFavoriteRepository } from '../../domain/ports/favorite-repository.port';
import type { IFavoriteTenantReader } from '../../domain/ports/favorite-tenant-reader.port';
import { AddFavoriteUseCase } from './add-favorite.use-case';

const HOST = 'studiohub.localhost';
const TENANT_ID = 'tenant-1';
const CUSTOMER_ID = 'customer-1';
const target = { target: 'listing', targetId: 'listing-1' } as unknown as FavoriteTarget;

function harness(options: { tenantId?: string | null; favoritable?: unknown } = {}) {
  const added: unknown[] = [];
  const tenantDb = fakeTenantDb();
  return {
    useCase: new AddFavoriteUseCase(
      fakePort<IFavoriteRepository>({
        findFavoritableTarget: () =>
          Promise.resolve(
            (options.favoritable === undefined
              ? { target: 'listing', id: 'listing-1', partnerId: 'partner-1' }
              : options.favoritable) as never,
          ),
        add: (_tx, data) => {
          added.push(data);
          return Promise.resolve();
        },
      }),
      fakePort<IFavoriteTenantReader>({
        resolveTenantId: () =>
          Promise.resolve(options.tenantId === undefined ? TENANT_ID : options.tenantId),
      }),
      tenantDb.service,
    ),
    tenantDb,
    added,
  };
}

describe('AddFavoriteUseCase', () => {
  it('refuses a host that resolves to no tenant', async () => {
    const { useCase, tenantDb } = harness({ tenantId: null });

    await expect(useCase.execute(HOST, CUSTOMER_ID, target)).rejects.toBeInstanceOf(TenantNotFound);
    expect(tenantDb.openedFor).toEqual([]);
  });

  it('refuses a target that is not favouritable on this tenant', async () => {
    // Hearts are only offered on published content the customer can see; without
    // this the endpoint would confirm the existence of hidden ids.
    const { useCase, added } = harness({ favoritable: null });

    await expect(useCase.execute(HOST, CUSTOMER_ID, target)).rejects.toBeInstanceOf(
      FavoriteTargetNotFound,
    );
    expect(added).toEqual([]);
  });

  it('adds the heart and reports the toggled state back', async () => {
    const { useCase, tenantDb, added } = harness();

    await expect(useCase.execute(HOST, CUSTOMER_ID, target)).resolves.toEqual({
      ...target,
      favorited: true,
    });
    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(added).toHaveLength(1);
  });
});
