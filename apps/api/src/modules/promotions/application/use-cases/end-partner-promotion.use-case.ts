import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  PROMOTION_REPOSITORY,
  type IPromotionRepository,
  type PromotionRecord,
} from '../../domain/ports/promotion-repository.port';

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
        throw new NotFoundException({ statusCode: 404, code: 'PROMO_NOT_FOUND', message: 'Promotion not found' });
      }
      if (existing.createdByPartnerId !== partnerId) {
        throw new ForbiddenException({ statusCode: 403, code: 'PROMO_NOT_OWNED', message: 'Not your promotion' });
      }
      return this.promotions.end(tx, id);
    });
  }
}
