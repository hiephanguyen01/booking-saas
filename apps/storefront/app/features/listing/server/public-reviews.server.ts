import {
  reviewListResponseSchema,
  type PublicReviewsQuery,
  type ReviewListResponse,
  type ReviewSummary,
} from '@booking/contracts';
import { publicGetData } from '~/lib/server/api.server';
import { optionalData } from '~/lib/server/optional-data.server';
import { DEFAULT_PUBLIC_REVIEW_LIMIT, PUBLIC_REVIEW_MAX_LIMIT } from '~/lib/public-reviews';

export interface PublicReviewData {
  reviews: ReviewListResponse | null;
  reviewSummary: ReviewSummary | null;
  reviewRating?: number;
  reviewLimit: number;
}

export function parseReviewRating(searchParams: URLSearchParams): number | undefined {
  const requested = Number(searchParams.get('rating'));
  return Number.isInteger(requested) && requested >= 1 && requested <= 5 ? requested : undefined;
}

export function parseReviewLimit(searchParams: URLSearchParams): number {
  const requested = Number(searchParams.get('reviewLimit'));
  if (!Number.isInteger(requested) || requested < DEFAULT_PUBLIC_REVIEW_LIMIT) {
    return DEFAULT_PUBLIC_REVIEW_LIMIT;
  }
  return Math.min(requested, PUBLIC_REVIEW_MAX_LIMIT);
}

export async function loadPublicReviews(
  request: Request,
  searchParams: URLSearchParams,
  target: PublicReviewsQuery['target'],
  slug: string,
): Promise<PublicReviewData> {
  const reviewRating = parseReviewRating(searchParams);
  const reviewLimit = parseReviewLimit(searchParams);
  const fetchReviews = (rating?: number, pageSize = reviewLimit) =>
    optionalData(
      publicGetData(request, '/public/reviews', {
        query: {
          target,
          slug,
          page: 1,
          pageSize,
          sort: 'newest',
          ...(rating ? { rating } : {}),
        },
        schema: reviewListResponseSchema,
      }),
      null,
    );

  const reviewsPromise = fetchReviews(reviewRating);
  const summaryPromise = reviewRating ? fetchReviews(undefined, 1) : Promise.resolve(null);
  const [reviews, unfilteredReviews] = await Promise.all([reviewsPromise, summaryPromise]);

  return {
    reviews,
    reviewSummary: unfilteredReviews?.summary ?? reviews?.summary ?? null,
    reviewRating,
    reviewLimit,
  };
}
