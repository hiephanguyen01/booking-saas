import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { ReplyReviewInput } from '@booking/contracts';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  REVIEW_REPOSITORY,
  type IReviewRepository,
  type ReviewRecord,
} from '../../domain/ports/review-repository.port';

@Injectable()
export class ReplyReviewUseCase {
  constructor(
    @Inject(REVIEW_REPOSITORY) private readonly reviews: IReviewRepository,
    private readonly tenantDb: TenantDbService,
    private readonly outbox: OutboxService,
  ) {}

  async execute(
    tenantId: string,
    reviewId: string,
    partnerId: string,
    authorUserId: string,
    input: ReplyReviewInput,
  ): Promise<ReviewRecord> {
    try {
      return await this.tenantDb.forTenant(tenantId, async (tx) => {
        const review = await this.reviews.reply(
          tx,
          tenantId,
          reviewId,
          partnerId,
          authorUserId,
          input.content,
        );
        if (!review) {
          throw new ConflictException({
            statusCode: 409,
            code: 'REVIEW_REPLY_NOT_ACCEPTED',
            message: 'Review is missing, already replied to, or belongs to another partner',
          });
        }
        await this.outbox.emit(tx, {
          tenantId,
          eventType: 'review.replied',
          payload: { reviewId: review.id, bookingId: review.bookingId },
        });
        return review;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException({
          statusCode: 409,
          code: 'REVIEW_REPLY_ALREADY_EXISTS',
          message: 'This review already has a reply',
        });
      }
      throw error;
    }
  }
}
