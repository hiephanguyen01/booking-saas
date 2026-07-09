import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  PROMOTION_REPOSITORY,
  type IPromotionRepository,
  type PromotionRecord,
} from '../../domain/ports/promotion-repository.port';
import {
  PROMO_REDEMPTION_REPOSITORY,
  type IPromoRedemptionRepository,
  type RedemptionUsageStats,
} from '../../domain/ports/promo-redemption-repository.port';

/** Per-program usage stats (§12.2): usage count + total amount discounted. */
@Injectable()
export class PromoUsageStatsUseCase {
  constructor(
    @Inject(PROMOTION_REPOSITORY) private readonly promotions: IPromotionRepository,
    @Inject(PROMO_REDEMPTION_REPOSITORY) private readonly redemptions: IPromoRedemptionRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(tenantId: string, id: string): Promise<{ promotion: PromotionRecord; stats: RedemptionUsageStats }> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const promotion = await this.promotions.findById(tx, id);
      if (!promotion) {
        throw new NotFoundException({ statusCode: 404, code: 'PROMO_NOT_FOUND', message: 'Promotion not found' });
      }
      const stats = await this.redemptions.usageStats(tx, id);
      return { promotion, stats };
    });
  }
}
