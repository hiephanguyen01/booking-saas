import { Inject, Injectable } from '@nestjs/common';
import type { PartnerReviewsQuery } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  REVIEW_REPOSITORY,
  type IReviewRepository,
  type ReviewPage,
} from '../../domain/ports/review-repository.port';

@Injectable()
export class ListPartnerReviewsUseCase {
  constructor(
    @Inject(REVIEW_REPOSITORY) private readonly reviews: IReviewRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  execute(tenantId: string, partnerId: string, query: PartnerReviewsQuery): Promise<ReviewPage> {
    return this.tenantDb.forTenant(tenantId, (tx) =>
      this.reviews.listPartner(tx, partnerId, query),
    );
  }
}
