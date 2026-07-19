import { Inject, Injectable } from '@nestjs/common';
import type { TenantReviewsQuery } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  REVIEW_REPOSITORY,
  type IReviewRepository,
  type ReviewPage,
} from '../../domain/ports/review-repository.port';

@Injectable()
export class ListTenantReviewsUseCase {
  constructor(
    @Inject(REVIEW_REPOSITORY) private readonly reviews: IReviewRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  execute(tenantId: string, query: TenantReviewsQuery): Promise<ReviewPage> {
    return this.tenantDb.forTenant(tenantId, (tx) => this.reviews.listTenant(tx, query));
  }
}
