import { describe, expect, it } from 'vitest';
import type { ListPromotionsQuery } from '@booking/contracts';
import { fakePort, fakeTenantDb } from '~testing';
import type { IPromotionRepository } from '../../domain/ports/promotion-repository.port';
import { ListPromotionsUseCase } from './list-promotions.use-case';

const PAGE = { items: [], total: 0 } as never;

describe('ListPromotionsUseCase', () => {
  it('lists inside the tenant transaction with the query intact', async () => {
    const seen: unknown[] = [];
    const tenantDb = fakeTenantDb();
    const useCase = new ListPromotionsUseCase(
      fakePort<IPromotionRepository>({
        list: (_tx, query) => {
          seen.push(query);
          return Promise.resolve(PAGE);
        },
      }),
      tenantDb.service,
    );

    const query = { page: 2, pageSize: 50, status: 'active' } as ListPromotionsQuery;
    const result = await useCase.execute('tenant-1', query);

    expect(tenantDb.openedFor).toEqual(['tenant-1']);
    expect(seen).toEqual([query]);
    expect(result).toBe(PAGE);
  });
});
