import { Inject, Injectable } from '@nestjs/common';
import type { ReviewMediaPresignInput } from '@booking/contracts';
import {
  STORAGE_PORT,
  type PresignedUpload,
  type StoragePort,
} from '../../../storage/domain/ports/storage.port';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  REVIEW_REPOSITORY,
  type IReviewRepository,
} from '../../domain/ports/review-repository.port';
import {
  REVIEW_TENANT_READER,
  type IReviewTenantReader,
} from '../../domain/ports/review-tenant-reader.port';
import { reviewMediaPrefix } from '../../domain/review-media';
import { TenantNotFound } from '../../../../shared/domain/errors/tenant-not-found';
import { ReviewMediaBookingNotEligible } from '../../domain/errors/review-errors';

@Injectable()
export class CreateReviewMediaUploadUseCase {
  constructor(
    @Inject(REVIEW_REPOSITORY) private readonly reviews: IReviewRepository,
    @Inject(REVIEW_TENANT_READER) private readonly tenants: IReviewTenantReader,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(
    host: string,
    customerId: string,
    input: ReviewMediaPresignInput,
  ): Promise<PresignedUpload> {
    const tenantId = await this.tenants.resolveTenantId(host);
    if (!tenantId) {
      throw new TenantNotFound();
    }
    const eligible = await this.tenantDb.forTenant(tenantId, (tx) =>
      this.reviews.isReviewableBooking(tx, customerId, input.bookingId),
    );
    if (!eligible) {
      throw new ReviewMediaBookingNotEligible();
    }
    return this.storage.createPresignedUpload({
      keyPrefix: reviewMediaPrefix(tenantId, customerId, input.bookingId),
      contentType: input.contentType,
    });
  }
}
