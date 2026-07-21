import type { ReviewListResponse, ReviewSummary } from '@booking/contracts';
import { cn } from '@booking/ui/lib/utils';
import { MessageSquareText } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';
import { RatingStars } from '../../components/rating-stars';
import { SectionCard } from '../../components/section-card';
import { NsI18n, useTranslation } from '../../lib/i18n';

export function PhotographerReviews({
  reviews,
  summary,
  locale,
  selectedRating,
}: {
  reviews: ReviewListResponse | null;
  summary: ReviewSummary | null;
  locale: 'vi' | 'en';
  selectedRating?: number;
}) {
  const { t } = useTranslation(NsI18n.Listing);
  const [searchParams] = useSearchParams();
  if (!summary || summary.reviewCount === 0) return null;

  const total = Object.values(summary.distribution).reduce((sum, count) => sum + count, 0);
  const filterHref = (rating?: number): string => {
    const next = new URLSearchParams(searchParams);
    if (rating) next.set('rating', String(rating));
    else next.delete('rating');
    return `?${next.toString()}`;
  };

  return (
    <SectionCard aria-labelledby="photographer-reviews-title">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="photographer-reviews-title" className="mr-auto text-base font-semibold">
          {t('photographer.reviews')}
        </h2>
        <RatingStars rating={summary.ratingAvg ?? 0} />
        <span className="text-sm font-medium">{summary.ratingAvg?.toFixed(1)}</span>
        <span className="text-sm text-muted-foreground">{t('reviewCount', { count: total })}</span>
      </div>

      <nav className="mt-5 flex gap-2 overflow-x-auto pb-1" aria-label={t('photographer.reviews')}>
        <Link
          to={filterHref()}
          preventScrollReset
          aria-current={selectedRating === undefined ? 'true' : undefined}
          className={filterClass(selectedRating === undefined)}
        >
          {t('photographer.allRatings')}
        </Link>
        {[5, 4, 3, 2, 1].map((rating) => (
          <Link
            key={rating}
            to={filterHref(rating)}
            preventScrollReset
            aria-current={selectedRating === rating ? 'true' : undefined}
            className={filterClass(selectedRating === rating)}
          >
            {t('photographer.ratingFilter', {
              count: rating,
              total: summary.distribution[rating as 1 | 2 | 3 | 4 | 5],
            })}
          </Link>
        ))}
      </nav>

      <div className="mt-5 divide-y divide-border">
        {reviews?.items.map((review) => (
          <article key={review.id} className="py-5 first:pt-0 last:pb-0">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-semibold">{review.customerName}</p>
                <RatingStars rating={review.rating} className="mt-1" />
              </div>
              <time className="shrink-0 text-xs text-muted-foreground" dateTime={review.createdAt}>
                {new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'vi-VN', {
                  dateStyle: 'medium',
                }).format(new Date(review.createdAt))}
              </time>
            </div>
            <p className="mt-3 max-w-4xl text-sm leading-6 text-muted-foreground">
              {review.content}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">{review.listingTitle}</p>
            {review.reply ? (
              <div className="mt-4 ml-0 rounded-lg bg-muted/70 p-4 sm:ml-10">
                <div className="flex items-center gap-2 text-xs font-semibold">
                  <MessageSquareText className="size-4 text-primary" aria-hidden="true" />
                  {review.reply.partnerName}
                </div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {review.reply.content}
                </p>
              </div>
            ) : null}
          </article>
        ))}
      </div>

      {selectedRating && (!reviews || reviews.items.length === 0) ? (
        <p className="mt-5 rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
          {t('noReviews')}
        </p>
      ) : null}
    </SectionCard>
  );
}

function filterClass(active: boolean): string {
  return cn(
    'inline-flex h-8 shrink-0 items-center rounded-md border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
    active
      ? 'border-primary bg-primary text-primary-foreground'
      : 'border-border bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground',
  );
}
