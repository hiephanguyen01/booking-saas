import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  PROMOTION_REPOSITORY,
  type IPromotionRepository,
  type PromotionRecord,
} from '../../domain/ports/promotion-repository.port';

/** List the tenant's promotions (§12.2). */
@Injectable()
export class ListPromotionsUseCase {
  constructor(
    @Inject(PROMOTION_REPOSITORY) private readonly promotions: IPromotionRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(tenantId: string): Promise<PromotionRecord[]> {
    return this.tenantDb.forTenant(tenantId, (tx) => this.promotions.list(tx));
  }
}
