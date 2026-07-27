import { Inject, Injectable } from '@nestjs/common';
import type { CreateReviewInput } from '@booking/contracts';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import { STORAGE_PORT, type StoragePort } from '../../../storage/domain/ports/storage.port';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { Review } from '../../domain/entities/review.entity';
import {
  InvalidReviewMedia,
  ReviewBookingNotEligible,
} from '../../domain/errors/review-errors';
import { TenantNotFound } from '../../../../shared/domain/errors/tenant-not-found';
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
    if (!tenantId) throw new TenantNotFound();
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
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const booking = await this.reviews.findEligibleBooking(tx, customerId, input.bookingId);
      if (!booking) throw new ReviewBookingNotEligible();
      const review = await this.reviews.insert(
        tx,
        tenantId,
        Review.open({ booking, customerId, rating: input.rating, content: input.content }),
        media,
      );
      await this.outbox.emit(tx, {
        tenantId,
        eventType: 'review.created',
        payload: { reviewId: review.id, listingId: review.listingId, groupId: review.groupId },
      });
      return review;
    });
  }
}

function invalidReviewMedia(message: string): InvalidReviewMedia {
  return new InvalidReviewMedia(message);
}
