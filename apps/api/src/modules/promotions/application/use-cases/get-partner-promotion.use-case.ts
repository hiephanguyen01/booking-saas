import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  PROMOTION_REPOSITORY,
  type IPromotionRepository,
} from '../../domain/ports/promotion-repository.port';
import { PROMO_CONTEXT_LOOKUP, type IPromoContextLookup } from '../../domain/ports/promo-context-lookup.port';
import { loadPromotionDetail, type PromotionDetail } from '../promotion-detail';

/**
 * Read one promotion the partner may see (§12.2): one it created, or a tenant-created
 * partner-funded promo it is asked to fund (which it must be able to review before
 * opting in — those have `createdByPartnerId === null`).
 *
 * Anything else 404s rather than 403s: within a tenant a partner has no business
 * learning which other promotion ids exist.
 */
@Injectable()
export class GetPartnerPromotionUseCase {
  constructor(
    @Inject(PROMOTION_REPOSITORY) private readonly promotions: IPromotionRepository,
    @Inject(PROMO_CONTEXT_LOOKUP) private readonly lookup: IPromoContextLookup,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(tenantId: string, partnerId: string, id: string): Promise<PromotionDetail> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const promotion = await this.promotions.findById(tx, id);
      const visible =
        promotion !== null &&
        (promotion.createdByPartnerId === partnerId || promotion.fundingPartnerId === partnerId);
      if (!promotion || !visible) {
        throw new NotFoundException({ statusCode: 404, code: 'PROMO_NOT_FOUND', message: 'Promotion not found' });
      }
      return loadPromotionDetail(this.lookup, tx, promotion);
    });
  }
}
