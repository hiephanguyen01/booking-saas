import type { CustomerReviewItem } from '@booking/contracts';
import { Image } from '@booking/ui/components/media/image';
import { Avatar, AvatarFallback } from '@booking/ui/components/ui/avatar';
import { Button } from '@booking/ui/components/ui/button';
import { ReviewMediaGallery } from '@booking/ui/components/review/review-media-gallery';
import { CalendarDays } from 'lucide-react';
import { Link } from 'react-router';
import { RatingStars } from '~/components/rating-stars';
import { ReviewTime } from '~/components/review-time';
import { NsI18n, useTranslation } from '@booking/i18n';
import { storefrontPaths } from '~/constants/paths';
import { nameInitials } from '~/lib/ui';
import { bookingDateInTz, bookingTimeInTz } from '~/lib/time';
import { useMediaViewerLabels } from '~/hooks/use-media-viewer-labels';
import { AccountPanel } from '~/features/account/components/shared/account-primitives';
import { BookingCardHeader } from '~/features/account/components/shared/booking-card-header';

type PendingReview = Extract<CustomerReviewItem, { status: 'pending' }>;

export function ReviewBookingCard({
  review,
  locale,
  onReview,
}: {
  review: CustomerReviewItem;
  locale: 'vi' | 'en';
  onReview: (review: PendingReview) => void;
}) {
  const { t } = useTranslation(NsI18n.Account);
  const viewerLabels = useMediaViewerLabels();
  const dateRange = formatBookingRange(
    review.bookingStartsAt,
    review.bookingEndsAt,
    locale,
    review.resourceTimezone,
  );

  return (
    <AccountPanel className="overflow-hidden">
      <BookingCardHeader
        partnerName={review.partnerName}
        listingSlug={review.listingSlug}
        bookingCode={review.bookingCode}
        status="completed"
        locale={locale}
      />

      <div className="grid gap-4 border-b border-border px-5 py-5 sm:grid-cols-[158px_1fr] sm:px-6">
        {review.listingImageUrl ? (
          <Image
            src={review.listingImageUrl}
            alt=""
            className="h-36 w-full rounded-sm object-cover sm:h-[114px]"
          />
        ) : (
          <div className="h-36 rounded-sm bg-muted sm:h-[114px]" />
        )}
        <div className="min-w-0 space-y-2">
          <Link
            to={storefrontPaths.listing(locale, review.listingSlug)}
            className="block text-sm font-semibold leading-5 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {review.listingTitle}
          </Link>
          <p className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
            <CalendarDays className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {dateRange ?? t('reviews.serviceCompleted')}
          </p>
          {review.bookingStartsAt && review.bookingEndsAt ? (
            <span className="inline-flex rounded-full bg-muted px-2 py-1 text-[11px] text-muted-foreground">
              {bookingTimeInTz(review.bookingStartsAt, review.resourceTimezone, locale)} –{' '}
              {bookingTimeInTz(review.bookingEndsAt, review.resourceTimezone, locale)}
            </span>
          ) : null}
        </div>
      </div>

      {review.status === 'pending' ? (
        <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-end sm:px-6">
          <p className="text-sm font-medium text-success">{t('reviews.invitation')}</p>
          <Button
            type="button"
            variant="outline"
            onClick={() => onReview(review)}
            className="text-primary"
          >
            {t('reviews.action')}
          </Button>
        </div>
      ) : (
        <div className="space-y-4 px-5 py-5 sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <Avatar className="size-10 shrink-0">
                <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                  {nameInitials(review.customerName, '?')}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{review.customerName}</p>
                <RatingStars rating={review.rating} className="mt-1 gap-0.5" />
              </div>
            </div>
            <ReviewTime
              value={review.createdAt}
              locale={locale}
              variant="day"
              className="shrink-0 text-xs text-muted-foreground"
            />
          </div>

          <p className="text-sm leading-6 text-foreground/85">{review.content}</p>
          <ReviewMediaGallery
            items={review.media}
            viewLabel={t('reviews.mediaView')}
            viewerTitle={t('reviews.mediaViewerTitle')}
            viewerLabels={viewerLabels}
          />
          <p className="text-xs text-muted-foreground">
            {t('reviews.listingLabel', { title: review.listingTitle })}
          </p>

          {review.reply ? (
            <div className="flex items-start gap-3">
              <Avatar className="size-8 shrink-0">
                <AvatarFallback className="bg-muted text-[11px] font-semibold">
                  {nameInitials(review.reply.partnerName, '?')}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1 rounded-md bg-muted/70 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold">
                    {t('reviews.partnerReply', { name: review.reply.partnerName })}
                  </p>
                  <ReviewTime
                    value={review.reply.createdAt}
                    locale={locale}
                    variant="day"
                    className="text-xs text-muted-foreground"
                  />
                </div>
                <p className="mt-2 text-sm leading-6 text-foreground/80">{review.reply.content}</p>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </AccountPanel>
  );
}

function formatBookingRange(
  start: string | null,
  end: string | null,
  locale: 'vi' | 'en',
  timeZone: string,
) {
  if (!start && !end) return null;
  const day = (value: string) => bookingDateInTz(value, timeZone, locale);
  if (start && end) return `${day(start)} – ${day(end)}`;
  return day(start ?? end ?? '');
}
