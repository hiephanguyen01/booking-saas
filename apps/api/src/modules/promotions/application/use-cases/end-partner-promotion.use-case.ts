import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  PROMOTION_REPOSITORY,
  type IPromotionRepository,
  type PromotionRecord,
} from '../../domain/ports/promotion-repository.port';
import { Promotion } from '../../domain/entities/promotion.entity';
import { PromotionNotFound } from '../../domain/errors/promotion-errors';

/** A partner ends one of its own promotions (§12.2, idempotent — history preserved). */
@Injectable()
export class EndPartnerPromotionUseCase {
  constructor(
    @Inject(PROMOTION_REPOSITORY) private readonly promotions: IPromotionRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  execute(tenantId: string, partnerId: string, id: string): Promise<PromotionRecord> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const existing = await this.promotions.findById(tx, id);
      if (!existing) {
        throw new PromotionNotFound();
      }
      const promotion = Promotion.rehydrate(existing);
      promotion.assertCreatedBy(partnerId);
      // KNOWN GAP (spec §8a): the tenant path short-circuits when already ended; this one
      // writes unconditionally (bumping updatedAt). Preserved on purpose — aligning them
      // would change the API response.
      return this.promotions.end(tx, id);
    });
  }
}
