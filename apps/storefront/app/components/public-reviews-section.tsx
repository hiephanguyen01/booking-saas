import type { ReviewListResponse, ReviewResponse, ReviewSummary } from '@booking/contracts';
import { Avatar, AvatarFallback } from '@booking/ui/components/ui/avatar';
import { cn } from '@booking/ui/lib/utils';
import { ChevronDown, Star } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';
import { PUBLIC_REVIEW_LIMIT_STEP, PUBLIC_REVIEW_MAX_LIMIT } from '../lib/public-reviews';
import { NsI18n, useTranslation } from '../lib/i18n';
import { RatingStars } from './rating-stars';
import { SectionCard } from './section-card';

export function PublicReviewsSection({
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
  const { t } = useTranslation(NsI18n.Listing);
  const [searchParams] = useSearchParams();

  if (!summary || summary.reviewCount === 0) return null;

  const ratingHref = (rating: number): string => {
    const next = new URLSearchParams(searchParams);
    if (selectedRating === rating) next.delete('rating');
    else next.set('rating', String(rating));
    next.delete('reviewLimit');
    return searchHref(next);
  };
  const moreHref = (): string => {
    const next = new URLSearchParams(searchParams);
    next.set(
      'reviewLimit',
      String(Math.min(visibleLimit + PUBLIC_REVIEW_LIMIT_STEP, PUBLIC_REVIEW_MAX_LIMIT)),
    );
    return searchHref(next);
  };
  const canShowMore =
    Boolean(reviews && reviews.total > reviews.items.length) &&
    visibleLimit < PUBLIC_REVIEW_MAX_LIMIT;

  return (
    <SectionCard aria-labelledby="public-reviews-title" className="flex flex-col gap-5">
      <div className="flex flex-col gap-4">
        <h2 id="public-reviews-title" className="text-base leading-6 font-semibold">
          {t('reviews.title')}
        </h2>
        <div className="flex flex-wrap items-center gap-2 text-sm leading-5">
          <span className="inline-flex items-center gap-1">
            <RatingStars rating={summary.ratingAvg ?? 0} />
            <strong className="font-medium text-foreground">
              {new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'vi-VN', {
                minimumFractionDigits: 1,
                maximumFractionDigits: 1,
              }).format(summary.ratingAvg ?? 0)}
            </strong>
          </span>
          <span className="h-4 w-px bg-border" aria-hidden="true" />
          <span className="text-muted-foreground">
            <strong className="font-medium text-foreground">{summary.reviewCount}</strong>{' '}
            {t('reviews.countLabel')}
          </span>
        </div>
      </div>

      <nav
        className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] sm:gap-3 [&::-webkit-scrollbar]:hidden"
        aria-label={t('reviews.filterLabel')}
      >
        {[5, 4, 3, 2, 1].map((rating) => {
          const active = selectedRating === rating;
          const count = summary.distribution[rating as 1 | 2 | 3 | 4 | 5];
          return (
            <Link
              key={rating}
              to={ratingHref(rating)}
              preventScrollReset
              aria-current={active ? 'true' : undefined}
              aria-label={`${rating} / 5, ${t('reviewCount', { count })}`}
              className={cn(
                'inline-flex h-8 shrink-0 items-center gap-1 rounded-sm border bg-card px-3 text-sm leading-5 shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                active
                  ? 'border-primary text-primary'
                  : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground',
              )}
            >
              <span className="font-medium">{rating}</span>
              <Star className="size-3.5 text-amber-500" fill="currentColor" aria-hidden="true" />
              <span>({count})</span>
            </Link>
          );
        })}
      </nav>

      <div className="divide-y divide-border border-t border-border">
        {reviews?.items.map((review) => (
          <ReviewItem key={review.id} review={review} locale={locale} />
        ))}
      </div>

      {selectedRating && (!reviews || reviews.items.length === 0) ? (
        <p className="rounded-md border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
          {t('reviews.emptyRating')}
        </p>
      ) : null}

      {canShowMore ? (
        <Link
          to={moreHref()}
          preventScrollReset
          className="mx-auto inline-flex items-center gap-1 text-sm font-medium text-emerald-600 transition-colors hover:text-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {t('reviews.showMore')}
          <ChevronDown className="size-4" aria-hidden="true" />
        </Link>
      ) : null}
    </SectionCard>
  );
}

function ReviewItem({ review, locale }: { review: ReviewResponse; locale: 'vi' | 'en' }) {
  const { t } = useTranslation(NsI18n.Listing);
  return (
    <article className="flex flex-col gap-2 py-5 first:pt-4 last:pb-0">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <ReviewAvatar name={review.customerName} className="size-10" />
          <div className="min-w-0">
            <p className="truncate text-sm leading-5 font-semibold">{review.customerName}</p>
            <RatingStars rating={review.rating} className="mt-1" />
          </div>
        </div>
        <ReviewTime value={review.createdAt} locale={locale} />
      </div>

      <p className="text-sm leading-5 text-foreground/85">{review.content}</p>
      <p className="text-sm leading-5 text-muted-foreground">
        {t('reviews.listingLabel', { title: review.listingTitle })}
      </p>

      {review.reply ? (
        <div className="mt-2 flex items-start gap-3">
          <ReviewAvatar name={review.reply.partnerName} className="size-8" />
          <div className="min-w-0 flex-1 rounded-md bg-muted px-3.5 py-3">
            <div className="flex items-start justify-between gap-3">
              <p className="min-w-0 truncate text-sm leading-5 font-semibold text-foreground">
                {review.reply.partnerName}
              </p>
              <ReviewTime value={review.reply.createdAt} locale={locale} />
            </div>
            <p className="mt-2 text-sm leading-5 text-foreground/85">{review.reply.content}</p>
          </div>
        </div>
      ) : null}
    </article>
  );
}

function ReviewAvatar({ name, className }: { name: string; className: string }) {
  return (
    <Avatar className={cn('shrink-0', className)}>
      <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
        {initials(name)}
      </AvatarFallback>
    </Avatar>
  );
}

function ReviewTime({ value, locale }: { value: string; locale: 'vi' | 'en' }) {
  return (
    <time
      className="shrink-0 pt-0.5 text-xs leading-4 text-muted-foreground"
      dateTime={value}
      suppressHydrationWarning
      title={new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'vi-VN', {
        dateStyle: 'long',
      }).format(new Date(value))}
    >
      {formatRelativeTime(value, locale)}
    </time>
  );
}

function formatRelativeTime(value: string, locale: 'vi' | 'en'): string {
  const seconds = Math.round((new Date(value).getTime() - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat(locale === 'en' ? 'en-US' : 'vi-VN', {
    numeric: 'always',
  });
  const divisions = [
    { amount: 60, unit: 'second' },
    { amount: 60, unit: 'minute' },
    { amount: 24, unit: 'hour' },
    { amount: 7, unit: 'day' },
    { amount: 4.345, unit: 'week' },
    { amount: 12, unit: 'month' },
    { amount: Number.POSITIVE_INFINITY, unit: 'year' },
  ] as const;
  let duration = seconds;
  for (const division of divisions) {
    if (Math.abs(duration) < division.amount) {
      return formatter.format(Math.round(duration), division.unit);
    }
    duration /= division.amount;
  }
  return formatter.format(Math.round(duration), 'year');
}

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || 'BK'
  );
}

function searchHref(searchParams: URLSearchParams): string {
  const query = searchParams.toString();
  return query ? `?${query}` : '?';
}
