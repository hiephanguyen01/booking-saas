import type { ReviewListResponse, ReviewSummary } from '@booking/contracts';
import { useSearchParams } from 'react-router';
import { intlLocale } from '~/lib/intl';
import { PUBLIC_REVIEW_LIMIT_STEP, PUBLIC_REVIEW_MAX_LIMIT } from '~/lib/public-reviews';

const RATINGS = [5, 4, 3, 2, 1] as const;

export function usePublicReviewsSectionController({
  reviews,
  summary,
  locale,
  selectedRating,
  visibleLimit,
}: {
  reviews: ReviewListResponse | null;
  summary: ReviewSummary | null;
  locale: 'vi' | 'en';
  selectedRating?: number;
  visibleLimit: number;
}) {
  const [searchParams] = useSearchParams();

  if (!summary || summary.reviewCount === 0) return null;

  const ratingItems = RATINGS.map((rating) => {
    const next = new URLSearchParams(searchParams);
    if (selectedRating === rating) next.delete('rating');
    else next.set('rating', String(rating));
    next.delete('reviewLimit');

    return {
      rating,
      count: summary.distribution[rating],
      active: selectedRating === rating,
      href: searchHref(next),
    };
  });
  const nextLimit = Math.min(visibleLimit + PUBLIC_REVIEW_LIMIT_STEP, PUBLIC_REVIEW_MAX_LIMIT);
  const moreParams = new URLSearchParams(searchParams);
  moreParams.set('reviewLimit', String(nextLimit));
  const canShowMore =
    Boolean(reviews && reviews.total > reviews.items.length) &&
    visibleLimit < PUBLIC_REVIEW_MAX_LIMIT;

  return {
    canShowMore,
    formattedAverage: new Intl.NumberFormat(intlLocale(locale, 'en-US'), {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(summary.ratingAvg ?? 0),
    moreHref: searchHref(moreParams),
    ratingItems,
    summary,
  };
}

function searchHref(searchParams: URLSearchParams): string {
  const query = searchParams.toString();
  return query ? `?${query}` : '?';
}
