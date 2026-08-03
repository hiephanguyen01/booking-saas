import type { ReviewListResponse, ReviewResponse, ReviewSummary } from '@booking/contracts';
import type { MediaViewerLabels } from '@booking/ui/components/media/media-viewer-dialog';
import { ReviewMediaGallery } from '@booking/ui/components/review/review-media-gallery';
import { Avatar, AvatarFallback } from '@booking/ui/components/ui/avatar';
import { cn } from '@booking/ui/lib/utils';
import { ChevronDown, Star } from 'lucide-react';
import { Link } from 'react-router';
import { useMediaViewerLabels } from '~/hooks/use-media-viewer-labels';
import { usePublicReviewsSectionController } from '~/hooks/use-public-reviews-section-controller';
import { nameInitials } from '~/lib/ui';
import { NsI18n, useTranslation } from '@booking/i18n';
import { RatingStars } from './rating-stars';
import { ReviewTime } from './review-time';
import { SectionCard } from './section-card';

export function PublicReviewsSection({
  reviews,
  reviewSummary,
  locale,
  reviewRating,
  reviewLimit,
}: {
  reviews: ReviewListResponse | null;
  reviewSummary: ReviewSummary | null;
  locale: 'vi' | 'en';
  reviewRating?: number;
  reviewLimit: number;
}) {
  const { t } = useTranslation(NsI18n.Listing);
  const viewerLabels = useMediaViewerLabels();
  const model = usePublicReviewsSectionController({
    reviews,
    reviewSummary,
    locale,
    reviewRating,
    reviewLimit,
  });

  if (!model) return null;

  return (
    <SectionCard aria-labelledby="public-reviews-title" className="flex flex-col gap-5">
      <div className="flex flex-col gap-4">
        <h2 id="public-reviews-title" className="text-base leading-6 font-semibold">
          {t('reviews.title')}
        </h2>
        <div className="flex flex-wrap items-center gap-2 text-sm leading-5">
          <span className="inline-flex items-center gap-1">
            <RatingStars rating={model.reviewSummary.ratingAvg ?? 0} />
            <strong className="font-medium text-foreground">{model.formattedAverage}</strong>
          </span>
          <span className="h-4 w-px bg-border" aria-hidden="true" />
          <span className="text-muted-foreground">
            <strong className="font-medium text-foreground">
              {model.reviewSummary.reviewCount}
            </strong>{' '}
            {t('reviews.countLabel')}
          </span>
        </div>
      </div>

      <nav
        className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] sm:gap-3 [&::-webkit-scrollbar]:hidden"
        aria-label={t('reviews.filterLabel')}
      >
        {model.ratingItems.map((item) => (
          <Link
            key={item.rating}
            to={item.href}
            preventScrollReset
            aria-current={item.active ? 'true' : undefined}
            aria-label={`${item.rating} / 5, ${t('reviewCount', { count: item.count })}`}
            className={cn(
              'inline-flex h-8 shrink-0 items-center gap-1 rounded-sm border bg-card px-3 text-sm leading-5 shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              item.active
                ? 'border-primary text-primary'
                : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground',
            )}
          >
            <span className="font-medium">{item.rating}</span>
            <Star className="size-3.5 text-warning" fill="currentColor" aria-hidden="true" />
            <span>({item.count})</span>
          </Link>
        ))}
      </nav>

      <div className="divide-y divide-border border-t border-border">
        {reviews?.items.map((review) => (
          <ReviewItem key={review.id} review={review} locale={locale} viewerLabels={viewerLabels} />
        ))}
      </div>

      {reviewRating && (!reviews || reviews.items.length === 0) ? (
        <p className="rounded-md border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
          {t('reviews.emptyRating')}
        </p>
      ) : null}

      {model.canShowMore ? (
        <Link
          to={model.moreHref}
          preventScrollReset
          className="mx-auto inline-flex items-center gap-1 text-sm font-medium text-success transition-colors hover:text-success focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {t('reviews.showMore')}
          <ChevronDown className="size-4" aria-hidden="true" />
        </Link>
      ) : null}
    </SectionCard>
  );
}

function ReviewItem({
  review,
  locale,
  viewerLabels,
}: {
  review: ReviewResponse;
  locale: 'vi' | 'en';
  viewerLabels: MediaViewerLabels;
}) {
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
        <ReviewTime
          value={review.createdAt}
          locale={locale}
          className="shrink-0 pt-0.5 text-xs leading-4 text-muted-foreground"
        />
      </div>

      <p className="text-sm leading-5 text-foreground/85">{review.content}</p>
      <ReviewMediaGallery
        items={review.media}
        viewLabel={t('reviews.mediaView')}
        viewerTitle={t('reviews.mediaViewerTitle')}
        viewerLabels={viewerLabels}
      />
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
              <ReviewTime
                value={review.reply.createdAt}
                locale={locale}
                className="shrink-0 pt-0.5 text-xs leading-4 text-muted-foreground"
              />
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
        {nameInitials(name, 'BK')}
      </AvatarFallback>
    </Avatar>
  );
}
