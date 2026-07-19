import type { AdminReviewsQuery } from '@booking/contracts';
import type { ReviewPage, ReviewRecord } from './review-repository.port';

export const ADMIN_REVIEW_READER = Symbol('ADMIN_REVIEW_READER');

export interface AdminReviewRecord extends ReviewRecord {
  tenantName: string;
}

export interface AdminReviewPage extends Omit<ReviewPage, 'items'> {
  items: AdminReviewRecord[];
}

export interface IAdminReviewReader {
  list(query: AdminReviewsQuery): Promise<AdminReviewPage>;
}
