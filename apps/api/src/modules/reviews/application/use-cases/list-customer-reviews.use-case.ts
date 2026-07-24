import { Inject, Injectable } from '@nestjs/common';
import type { CustomerReviewsQuery } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  REVIEW_REPOSITORY,
  type CustomerReviewPage,
  type IReviewRepository,
} from '../../domain/ports/review-repository.port';
import {
  REVIEW_TENANT_READER,
  type IReviewTenantReader,
} from '../../domain/ports/review-tenant-reader.port';
import { TenantNotFound } from '../../../../shared/domain/errors/tenant-not-found';

@Injectable()
export class ListCustomerReviewsUseCase {
  constructor(
    @Inject(REVIEW_REPOSITORY) private readonly reviews: IReviewRepository,
    @Inject(REVIEW_TENANT_READER) private readonly tenants: IReviewTenantReader,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(
    host: string,
    customerId: string,
    query: CustomerReviewsQuery,
  ): Promise<CustomerReviewPage> {
    const tenantId = await this.tenants.resolveTenantId(host);
    if (!tenantId) throw new TenantNotFound();
    return this.tenantDb.forTenant(tenantId, (tx) =>
      this.reviews.listCustomer(tx, customerId, query),
    );
  }
}
