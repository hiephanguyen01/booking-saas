import { Inject, Injectable } from '@nestjs/common';
import type { ListPromotionsQuery } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import type { RepoPage } from '../../../../shared/pagination/pagination';
import {
  PROMOTION_REPOSITORY,
  type IPromotionRepository,
  type PromotionRecord,
} from '../../domain/ports/promotion-repository.port';

/** List the tenant's promotions (§12.2) — name/code search + status + date range. */
@Injectable()
export class ListPromotionsUseCase {
  constructor(
    @Inject(PROMOTION_REPOSITORY) private readonly promotions: IPromotionRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(
    tenantId: string,
    query: ListPromotionsQuery,
  ): Promise<RepoPage<PromotionRecord>> {
    return this.tenantDb.forTenant(tenantId, (tx) => this.promotions.list(tx, query));
  }
}
