import type {
  AdminReviewListResponse,
  CustomerReviewItem,
  CustomerReviewListResponse,
  ReviewListResponse,
  ReviewResponse,
  ReviewSummary,
} from '@booking/contracts';
import type { AdminReviewPage } from '../domain/ports/admin-review-reader.port';
import type {
  CustomerReviewPage,
  PendingReviewRecord,
  ReviewPage,
  ReviewRecord,
  ReviewSummaryRecord,
} from '../domain/ports/review-repository.port';

export function toReviewResponse(review: ReviewRecord): ReviewResponse {
  return {
    id: review.id,
    bookingId: review.bookingId,
    bookingCode: review.bookingCode,
    listingId: review.listingId,
    listingTitle: review.listingTitle,
    listingSlug: review.listingSlug,
    listingImageUrl: review.listingImageUrl,
    groupId: review.groupId,
    groupTitle: review.groupTitle,
    groupSlug: review.groupSlug,
    partnerId: review.partnerId,
    partnerName: review.partnerName,
    customerName: review.customerName,
    rating: review.rating,
    content: review.content,
    reply: review.reply
      ? {
          id: review.reply.id,
          content: review.reply.content,
          partnerName: review.reply.partnerName,
          createdAt: review.reply.createdAt.toISOString(),
        }
      : null,
    serviceCompletedAt: review.serviceCompletedAt?.toISOString() ?? null,
    createdAt: review.createdAt.toISOString(),
  };
}

function toPendingResponse(item: PendingReviewRecord): CustomerReviewItem {
  return {
    ...item,
    serviceCompletedAt: item.serviceCompletedAt?.toISOString() ?? null,
  };
}

export function toReviewSummary(summary: ReviewSummaryRecord): ReviewSummary {
  return summary;
}

export function toReviewListResponse(
  page: ReviewPage,
  query: { page: number; pageSize: number },
): ReviewListResponse {
  return {
    items: page.items.map(toReviewResponse),
    summary: toReviewSummary(page.summary),
    page: query.page,
    pageSize: query.pageSize,
    total: page.total,
  };
}

export function toCustomerReviewListResponse(
  page: CustomerReviewPage,
  query: { page: number; pageSize: number },
): CustomerReviewListResponse {
  return {
    items: page.items.map((item) =>
      'status' in item
        ? toPendingResponse(item)
        : { ...toReviewResponse(item), status: 'reviewed' as const },
    ),
    page: query.page,
    pageSize: query.pageSize,
    total: page.total,
  };
}

export function toAdminReviewListResponse(
  page: AdminReviewPage,
  query: { page: number; pageSize: number },
): AdminReviewListResponse {
  return {
    items: page.items.map((item) => ({
      ...toReviewResponse(item),
      tenantId: item.tenantId,
      tenantName: item.tenantName,
    })),
    summary: toReviewSummary(page.summary),
    page: query.page,
    pageSize: query.pageSize,
    total: page.total,
  };
}
