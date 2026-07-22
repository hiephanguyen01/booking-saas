import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { CreateReviewInput } from '@booking/contracts';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import { STORAGE_PORT, type StoragePort } from '../../../../shared/storage/storage.port';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  REVIEW_REPOSITORY,
  type IReviewRepository,
  type ReviewRecord,
} from '../../domain/ports/review-repository.port';
import {
  REVIEW_TENANT_READER,
  type IReviewTenantReader,
} from '../../domain/ports/review-tenant-reader.port';
import {
  isReviewMediaKeyInScope,
  reviewMediaKindFromKey,
  reviewMediaPrefix,
} from '../../domain/review-media';

@Injectable()
export class CreateReviewUseCase {
  constructor(
    @Inject(REVIEW_REPOSITORY) private readonly reviews: IReviewRepository,
    @Inject(REVIEW_TENANT_READER) private readonly tenants: IReviewTenantReader,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
    private readonly tenantDb: TenantDbService,
    private readonly outbox: OutboxService,
  ) {}

  async execute(host: string, customerId: string, input: CreateReviewInput): Promise<ReviewRecord> {
    const tenantId = await this.tenants.resolveTenantId(host);
    if (!tenantId)
      throw new NotFoundException({
        statusCode: 404,
        code: 'TENANT_NOT_FOUND',
        message: 'Tenant not found',
      });
    const prefix = reviewMediaPrefix(tenantId, customerId, input.bookingId);
    const uniqueKeys = new Set(input.media.map((item) => item.key));
    if (uniqueKeys.size !== input.media.length) {
      throw invalidReviewMedia('Duplicate review media keys are not allowed');
    }
    const media = input.media.map(({ key }) => {
      const kind = reviewMediaKindFromKey(key);
      if (!kind || !isReviewMediaKeyInScope(key, prefix)) {
        throw invalidReviewMedia('Review media key is invalid or outside the booking scope');
      }
      return { kind, key, url: this.storage.publicUrlForKey(key) };
    });
    try {
      return await this.tenantDb.forTenant(tenantId, async (tx) => {
        const review = await this.reviews.create(tx, tenantId, customerId, {
          bookingId: input.bookingId,
          rating: input.rating,
          content: input.content,
          media,
        });
        if (!review) {
          throw new ConflictException({
            statusCode: 409,
            code: 'REVIEW_BOOKING_NOT_ELIGIBLE',
            message: 'Only an owned completed booking without a review can be reviewed',
          });
        }
        await this.outbox.emit(tx, {
          tenantId,
          eventType: 'review.created',
          payload: { reviewId: review.id, listingId: review.listingId, groupId: review.groupId },
        });
        return review;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException({
          statusCode: 409,
          code: 'REVIEW_ALREADY_EXISTS',
          message: 'This booking already has a review',
        });
      }
      throw error;
    }
  }
}

function invalidReviewMedia(message: string): BadRequestException {
  return new BadRequestException({
    statusCode: 400,
    code: 'INVALID_REVIEW_MEDIA',
    message,
  });
}
