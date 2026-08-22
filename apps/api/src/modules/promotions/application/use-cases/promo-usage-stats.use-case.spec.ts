import { describe, expect, it } from 'vitest';
import { fakePort, fakeTenantDb } from '~testing';
import { PromotionNotFound } from '../../domain/errors/promotion-errors';
import type { IPromoRedemptionRepository } from '../../domain/ports/promo-redemption-repository.port';
import type {
  IPromotionRepository,
  PromotionRecord,
} from '../../domain/ports/promotion-repository.port';
import { PromoUsageStatsUseCase } from './promo-usage-stats.use-case';

const PROMOTION = { id: 'promo-1', code: 'SALE10' } as unknown as PromotionRecord;
const STATS = { reserved: 2, applied: 8, released: 1 } as never;

function harness(found: PromotionRecord | null = PROMOTION) {
  const statsFor: string[] = [];
  const tenantDb = fakeTenantDb();
  return {
    useCase: new PromoUsageStatsUseCase(
      fakePort<IPromotionRepository>({ findById: () => Promise.resolve(found) }),
      fakePort<IPromoRedemptionRepository>({
        usageStats: (_tx, id) => {
          statsFor.push(id);
          return Promise.resolve(STATS);
        },
      }),
      tenantDb.service,
    ),
    tenantDb,
    statsFor,
  };
}

describe('PromoUsageStatsUseCase', () => {
  it('answers not-found before reading any stats', async () => {
    // Stats for a promotion outside the tenant would leak how a competitor's
    // campaign is performing.
    const { useCase, statsFor } = harness(null);

    await expect(useCase.execute('tenant-1', 'promo-1')).rejects.toBeInstanceOf(
      PromotionNotFound,
    );
    expect(statsFor).toEqual([]);
  });

  it('pairs the promotion with the stats of THAT promotion', async () => {
    const { useCase, statsFor, tenantDb } = harness();

    const result = await useCase.execute('tenant-1', 'promo-1');

    expect(tenantDb.openedFor).toEqual(['tenant-1']);
    expect(statsFor).toEqual(['promo-1']);
    expect(result).toEqual({ promotion: PROMOTION, stats: STATS });
  });
});
