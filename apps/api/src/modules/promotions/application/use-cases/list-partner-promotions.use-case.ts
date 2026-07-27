import { Inject, Injectable } from '@nestjs/common';
import type { ListPartnerPromotionsQuery } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import type { RepoPage } from '../../../../shared/pagination/pagination';
import {
  PROMOTION_REPOSITORY,
  type IPromotionRepository,
  type PromotionRecord,
} from '../../domain/ports/promotion-repository.port';

/** A partner lists its own promotions (§12.2). */
@Injectable()
export class ListPartnerPromotionsUseCase {
  constructor(
    @Inject(PROMOTION_REPOSITORY) private readonly promotions: IPromotionRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  execute(
    tenantId: string,
    partnerId: string,
    query: ListPartnerPromotionsQuery,
  ): Promise<RepoPage<PromotionRecord>> {
    return this.tenantDb.forTenant(tenantId, (tx) =>
      this.promotions.listByPartner(tx, partnerId, query),
    );
  }
}
