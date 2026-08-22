import { describe, expect, it } from 'vitest';
import type { PartnerFavoritesQuery } from '@booking/contracts';
import { fakePort, fakeTenantDb } from '~testing';
import type { IFavoriteReader } from '../../domain/ports/favorite-reader.port';
import { ListPartnerFavoritesUseCase } from './list-partner-favorites.use-case';

const TENANT_ID = 'tenant-1';
const PARTNER_ID = 'partner-1';

describe('ListPartnerFavoritesUseCase', () => {
  it('narrows the dashboard feed to the calling partner', async () => {
    // The same reader backs the tenant-wide list; the partner id is the ONLY
    // thing keeping one partner out of another's audience data.
    const calls: Array<{ query: unknown; partnerId?: string }> = [];
    const page = { items: [], total: 0 } as never;
    const tenantDb = fakeTenantDb();
    const useCase = new ListPartnerFavoritesUseCase(
      fakePort<IFavoriteReader>({
        listDashboard: (_tx, query, partnerId) => {
          calls.push({ query, partnerId });
          return Promise.resolve(page);
        },
      }),
      tenantDb.service,
    );

    const query = { page: 1, pageSize: 20 } as PartnerFavoritesQuery;
    await expect(useCase.execute(TENANT_ID, PARTNER_ID, query)).resolves.toBe(page);
    expect(tenantDb.openedFor).toEqual([TENANT_ID]);
    expect(calls).toEqual([{ query, partnerId: PARTNER_ID }]);
  });
});
