import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  PROMOTION_REPOSITORY,
  type IPromotionRepository,
  type PromotionRecord,
} from '../../domain/ports/promotion-repository.port';

/**
 * End a promotion (§12.2). A program is never deleted — it transitions to
 * `ended` so its usage history and the bookings' snapshots stay intact.
 */
@Injectable()
export class EndPromotionUseCase {
  constructor(
    @Inject(PROMOTION_REPOSITORY) private readonly promotions: IPromotionRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(tenantId: string, id: string): Promise<PromotionRecord> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const existing = await this.promotions.findById(tx, id);
      if (!existing) {
        throw new NotFoundException({ statusCode: 404, code: 'PROMO_NOT_FOUND', message: 'Promotion not found' });
      }
      if (existing.status === 'ended') return existing;
      return this.promotions.end(tx, id);
    });
  }
}
