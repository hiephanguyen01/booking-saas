import { Inject, Injectable } from '@nestjs/common';
import type { PublicReviewsQuery } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  REVIEW_REPOSITORY,
  type IReviewRepository,
  type ReviewPage,
} from '../../domain/ports/review-repository.port';
import {
  REVIEW_TENANT_READER,
  type IReviewTenantReader,
} from '../../domain/ports/review-tenant-reader.port';
import { TenantNotFound } from '../../../../shared/domain/errors/tenant-not-found';
import { ReviewTargetNotFound } from '../../domain/errors/review-errors';

@Injectable()
export class ListPublicReviewsUseCase {
  constructor(
    @Inject(REVIEW_REPOSITORY) private readonly reviews: IReviewRepository,
    @Inject(REVIEW_TENANT_READER) private readonly tenants: IReviewTenantReader,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(host: string, query: PublicReviewsQuery): Promise<ReviewPage> {
    const tenantId = await this.tenants.resolveTenantId(host);
    if (!tenantId) throw new TenantNotFound();
    const page = await this.tenantDb.forTenant(tenantId, (tx) =>
      this.reviews.listPublic(tx, query),
    );
    if (!page) throw new ReviewTargetNotFound();
    return page;
  }
}
