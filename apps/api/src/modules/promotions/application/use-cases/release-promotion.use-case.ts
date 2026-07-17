import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  PROMOTION_REPOSITORY,
  type IPromotionRepository,
} from '../../domain/ports/promotion-repository.port';
import {
  PROMO_REDEMPTION_REPOSITORY,
  type IPromoRedemptionRepository,
} from '../../domain/ports/promo-redemption-repository.port';

/**
 * booking expired/rejected/fully-refunded-cancel → redemption `released` and
 * the usage returned, both in one tx (idempotent — reversed exactly once).
 * Driven by outbox events, so it opens its own transaction (§12.3).
 */
@Injectable()
export class ReleasePromotionUseCase {
  constructor(
    @Inject(PROMOTION_REPOSITORY) private readonly promotions: IPromotionRepository,
    @Inject(PROMO_REDEMPTION_REPOSITORY) private readonly redemptions: IPromoRedemptionRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(tenantId: string, bookingId: string): Promise<void> {
    await this.tenantDb.forTenant(tenantId, async (tx) => {
      const promotionId = await this.redemptions.release(tx, bookingId);
      if (promotionId) await this.promotions.releaseUsage(tx, promotionId);
    });
  }
}
