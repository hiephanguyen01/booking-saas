import { Inject, Injectable } from '@nestjs/common';
import type { AdminReviewsQuery } from '@booking/contracts';
import {
  ADMIN_REVIEW_READER,
  type AdminReviewPage,
  type IAdminReviewReader,
} from '../../domain/ports/admin-review-reader.port';

@Injectable()
export class ListAdminReviewsUseCase {
  constructor(@Inject(ADMIN_REVIEW_READER) private readonly reviews: IAdminReviewReader) {}

  execute(query: AdminReviewsQuery): Promise<AdminReviewPage> {
    return this.reviews.list(query);
  }
}
