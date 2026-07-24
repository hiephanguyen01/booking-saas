import type {
  CustomerReviewsQuery,
  PartnerReviewsQuery,
  PublicReviewsQuery,
  ReviewMediaKind,
  TenantReviewsQuery,
} from '@booking/contracts';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type {
  EligibleBooking,
  NewReview,
  Review,
  ReviewState,
} from '../entities/review.entity';

export const REVIEW_REPOSITORY = Symbol('REVIEW_REPOSITORY');

export interface ReviewReplyRecord {
  id: string;
  content: string;
  partnerName: string;
  createdAt: Date;
}

export interface ReviewMediaRecord {
  kind: ReviewMediaKind;
  key: string;
  url: string;
}

export interface ReviewRecord {
  id: string;
  tenantId: string;
  bookingId: string;
  bookingCode: string;
  listingId: string;
  listingTitle: string;
  listingSlug: string;
  listingImageUrl: string | null;
  groupId: string | null;
  groupTitle: string | null;
  groupSlug: string | null;
  partnerId: string;
  partnerName: string;
  customerName: string;
  rating: number;
  content: string;
  media: ReviewMediaRecord[];
  reply: ReviewReplyRecord | null;
  serviceCompletedAt: Date | null;
  bookingStartsAt: Date | null;
  bookingEndsAt: Date | null;
  createdAt: Date;
}

export interface PendingReviewRecord {
  status: 'pending';
  bookingId: string;
  bookingCode: string;
  listingId: string;
  listingTitle: string;
  listingSlug: string;
  listingImageUrl: string | null;
  groupTitle: string | null;
  partnerName: string;
  serviceCompletedAt: Date | null;
  bookingStartsAt: Date | null;
  bookingEndsAt: Date | null;
}

export interface ReviewSummaryRecord {
  ratingAvg: number | null;
  reviewCount: number;
  unansweredCount: number;
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
}

export interface ReviewPage {
  items: ReviewRecord[];
  total: number;
  summary: ReviewSummaryRecord;
}

export interface CustomerReviewPage {
  items: Array<ReviewRecord | PendingReviewRecord>;
  total: number;
}

export interface IReviewRepository {
  isReviewableBooking(tx: PrismaTx, customerId: string, bookingId: string): Promise<boolean>;
  /** §16 eligibility read: owned + completed + not-yet-reviewed booking (null = not eligible). */
  findEligibleBooking(
    tx: PrismaTx,
    customerId: string,
    bookingId: string,
  ): Promise<EligibleBooking | null>;
  /** Insert a validated new review; the `(booking_id)` unique race → `ReviewAlreadyExists`. */
  insert(
    tx: PrismaTx,
    tenantId: string,
    review: NewReview,
    media: ReviewMediaRecord[],
  ): Promise<ReviewRecord>;
  /** Narrow write-state for the reply path (null = review not found). */
  loadForReply(tx: PrismaTx, reviewId: string): Promise<ReviewState | null>;
  /** Persist the reply queued on the aggregate; `(review_id)` unique race → `ReviewReplyAlreadyExists`. */
  saveReply(tx: PrismaTx, tenantId: string, review: Review): Promise<ReviewRecord>;
  listCustomer(
    tx: PrismaTx,
    customerId: string,
    query: CustomerReviewsQuery,
  ): Promise<CustomerReviewPage>;
  listPublic(tx: PrismaTx, query: PublicReviewsQuery): Promise<ReviewPage | null>;
  listPartner(tx: PrismaTx, partnerId: string, query: PartnerReviewsQuery): Promise<ReviewPage>;
  listTenant(tx: PrismaTx, query: TenantReviewsQuery): Promise<ReviewPage>;
}
