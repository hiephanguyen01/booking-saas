import { describe, expect, it } from 'vitest';
import type { ListPartnerPromotionsQuery } from '@booking/contracts';
import { fakePort, fakeTenantDb } from '~testing';
import type { IPromotionRepository } from '../../domain/ports/promotion-repository.port';
import { ListPartnerPromotionsUseCase } from './list-partner-promotions.use-case';

const PAGE = { items: [], total: 0 } as never;

describe('ListPartnerPromotionsUseCase', () => {
  it('lists THIS partner’s promotions with the query intact', async () => {
    const seen: Array<{ partnerId: string; query: unknown }> = [];
    const tenantDb = fakeTenantDb();
    const useCase = new ListPartnerPromotionsUseCase(
      fakePort<IPromotionRepository>({
        listByPartner: (_tx, partnerId, query) => {
          seen.push({ partnerId, query });
          return Promise.resolve(PAGE);
        },
      }),
      tenantDb.service,
    );

    const query = { page: 2, pageSize: 50 } as ListPartnerPromotionsQuery;
    const result = await useCase.execute('tenant-1', 'partner-1', query);

    expect(tenantDb.openedFor).toEqual(['tenant-1']);
    expect(seen).toEqual([{ partnerId: 'partner-1', query }]);
    expect(result).toBe(PAGE);
  });
});
