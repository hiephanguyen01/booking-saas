import { Inject, Injectable } from '@nestjs/common';
import type { ReplyReviewInput } from '@booking/contracts';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { Review } from '../../domain/entities/review.entity';
import { ReviewReplyNotAccepted } from '../../domain/errors/review-errors';
import { ReviewContent } from '../../domain/value-objects/review-content';
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
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const state = await this.reviews.loadForReply(tx, reviewId);
      if (!state) throw new ReviewReplyNotAccepted();
      const review = Review.rehydrate(state);
      review.addReply(partnerId, authorUserId, ReviewContent.of(input.content));
      const record = await this.reviews.saveReply(tx, tenantId, review);
      await this.outbox.emit(tx, {
        tenantId,
        eventType: 'review.replied',
        payload: { reviewId: record.id, bookingId: record.bookingId },
      });
      return record;
    });
  }
}
