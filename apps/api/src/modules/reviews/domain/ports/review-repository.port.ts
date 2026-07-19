import type {
  CustomerReviewsQuery,
  PartnerReviewsQuery,
  PublicReviewsQuery,
  TenantReviewsQuery,
} from '@booking/contracts';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';

export const REVIEW_REPOSITORY = Symbol('REVIEW_REPOSITORY');

export interface ReviewReplyRecord {
  id: string;
  content: string;
  partnerName: string;
  createdAt: Date;
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
  reply: ReviewReplyRecord | null;
  serviceCompletedAt: Date | null;
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
  create(
    tx: PrismaTx,
    tenantId: string,
    customerId: string,
    data: { bookingId: string; rating: number; content: string },
  ): Promise<ReviewRecord | null>;
  reply(
    tx: PrismaTx,
    tenantId: string,
    reviewId: string,
    partnerId: string,
    authorUserId: string,
    content: string,
  ): Promise<ReviewRecord | null>;
  listCustomer(
    tx: PrismaTx,
    customerId: string,
    query: CustomerReviewsQuery,
  ): Promise<CustomerReviewPage>;
  listPublic(tx: PrismaTx, query: PublicReviewsQuery): Promise<ReviewPage | null>;
  listPartner(tx: PrismaTx, partnerId: string, query: PartnerReviewsQuery): Promise<ReviewPage>;
  listTenant(tx: PrismaTx, query: TenantReviewsQuery): Promise<ReviewPage>;
}
