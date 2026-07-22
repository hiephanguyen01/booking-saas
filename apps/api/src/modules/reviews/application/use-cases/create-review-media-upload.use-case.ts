import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { ReviewMediaPresignInput } from '@booking/contracts';
import {
  STORAGE_PORT,
  type PresignedUpload,
  type StoragePort,
} from '../../../../shared/storage/storage.port';
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
      throw new NotFoundException({
        statusCode: 404,
        code: 'TENANT_NOT_FOUND',
        message: 'Tenant not found',
      });
    }
    const eligible = await this.tenantDb.forTenant(tenantId, (tx) =>
      this.reviews.isReviewableBooking(tx, customerId, input.bookingId),
    );
    if (!eligible) {
      throw new ConflictException({
        statusCode: 409,
        code: 'REVIEW_BOOKING_NOT_ELIGIBLE',
        message: 'Only an owned completed booking without a review can upload review media',
      });
    }
    return this.storage.createPresignedUpload({
      keyPrefix: reviewMediaPrefix(tenantId, customerId, input.bookingId),
      contentType: input.contentType,
    });
  }
}
