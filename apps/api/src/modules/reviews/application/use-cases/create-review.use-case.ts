import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { CreateReviewInput } from '@booking/contracts';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
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

@Injectable()
export class CreateReviewUseCase {
  constructor(
    @Inject(REVIEW_REPOSITORY) private readonly reviews: IReviewRepository,
    @Inject(REVIEW_TENANT_READER) private readonly tenants: IReviewTenantReader,
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
    try {
      return await this.tenantDb.forTenant(tenantId, async (tx) => {
        const review = await this.reviews.create(tx, tenantId, customerId, input);
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
