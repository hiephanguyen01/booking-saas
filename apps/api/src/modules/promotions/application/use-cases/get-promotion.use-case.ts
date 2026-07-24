import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  PROMOTION_REPOSITORY,
  type IPromotionRepository,
} from '../../domain/ports/promotion-repository.port';
import { PROMO_CONTEXT_LOOKUP, type IPromoContextLookup } from '../../domain/ports/promo-context-lookup.port';
import { loadPromotionDetail, type PromotionDetail } from '../promotion-detail';
import { PromotionNotFound } from '../../domain/errors/promotion-errors';

/**
 * Read one promotion (§12.2). The tenant detail page used to fetch the whole list and
 * `.find()` the id client-side, which only worked while the list was unpaginated —
 * this endpoint is the paginated-safe read.
 */
@Injectable()
export class GetPromotionUseCase {
  constructor(
    @Inject(PROMOTION_REPOSITORY) private readonly promotions: IPromotionRepository,
    @Inject(PROMO_CONTEXT_LOOKUP) private readonly lookup: IPromoContextLookup,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(tenantId: string, id: string): Promise<PromotionDetail> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const promotion = await this.promotions.findById(tx, id);
      if (!promotion) {
        throw new PromotionNotFound();
      }
      return loadPromotionDetail(this.lookup, tx, promotion);
    });
  }
}
