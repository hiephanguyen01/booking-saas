import type { CustomerReviewItem } from '@booking/contracts';
import { Avatar, AvatarFallback } from '@booking/ui/components/ui/avatar';
import { Button } from '@booking/ui/components/ui/button';
import { ReviewMediaGallery } from '@booking/ui/components/review/review-media-gallery';
import { Building2, CalendarDays, MessageSquareText, Star } from 'lucide-react';
import { Link } from 'react-router';
import { NsI18n, useTranslation } from '../../../lib/i18n';
import { storefrontPaths } from '../../../lib/locale-paths';
import { AccountPanel } from './account-primitives';

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
  const dateRange = formatBookingRange(review.bookingStartsAt, review.bookingEndsAt, locale);

  return (
    <AccountPanel className="overflow-hidden border border-border/50 shadow-[0_4px_16px_rgba(16,24,40,0.04)]">
      <div className="flex flex-col gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <span className="inline-flex min-w-0 items-center gap-2 text-sm font-medium">
            <Building2 className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="truncate">{review.partnerName}</span>
          </span>
          <Button asChild variant="outline" size="sm" className="text-primary">
            <Link to={storefrontPaths.account.messages(locale)}>
              <MessageSquareText className="size-4" aria-hidden="true" />
              {t('reviews.chat')}
            </Link>
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs font-medium uppercase">
          <span className="text-muted-foreground">
            {t('reviews.bookingCode', { code: review.bookingCode })}
          </span>
          <span className="h-4 w-px bg-border" aria-hidden="true" />
          <span className="text-primary">{t('reviews.completed')}</span>
        </div>
      </div>

      <div className="grid gap-4 border-b border-border px-5 py-5 sm:grid-cols-[158px_1fr] sm:px-6">
        {review.listingImageUrl ? (
          <img
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
              {formatTime(review.bookingStartsAt, locale)} – {formatTime(review.bookingEndsAt, locale)}
            </span>
          ) : null}
        </div>
      </div>

      {review.status === 'pending' ? (
        <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-end sm:px-6">
          <p className="text-sm font-medium text-emerald-600">{t('reviews.invitation')}</p>
          <Button type="button" variant="outline" onClick={() => onReview(review)} className="text-primary">
            {t('reviews.action')}
          </Button>
        </div>
      ) : (
        <div className="space-y-4 px-5 py-5 sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <Avatar className="size-10 shrink-0">
                <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                  {initials(review.customerName)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{review.customerName}</p>
                <Stars rating={review.rating} />
              </div>
            </div>
            <time
              dateTime={review.createdAt}
              className="shrink-0 text-xs text-muted-foreground"
              suppressHydrationWarning
            >
              {formatRelativeTime(review.createdAt, locale)}
            </time>
          </div>

          <p className="text-sm leading-6 text-foreground/85">{review.content}</p>
          <ReviewMediaGallery
            items={review.media}
            viewLabel={t('reviews.mediaView')}
            viewerTitle={t('reviews.mediaViewerTitle')}
          />
          <p className="text-xs text-muted-foreground">
            {t('reviews.listingLabel', { title: review.listingTitle })}
          </p>

          {review.reply ? (
            <div className="flex items-start gap-3">
              <Avatar className="size-8 shrink-0">
                <AvatarFallback className="bg-muted text-[11px] font-semibold">
                  {initials(review.reply.partnerName)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1 rounded-md bg-muted/70 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold">
                    {t('reviews.partnerReply', { name: review.reply.partnerName })}
                  </p>
                  <time className="text-xs text-muted-foreground" dateTime={review.reply.createdAt}>
                    {formatRelativeTime(review.reply.createdAt, locale)}
                  </time>
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

function Stars({ rating }: { rating: number }) {
  return (
    <div className="mt-1 flex gap-0.5 text-amber-500" aria-label={`${rating}/5`}>
      {[1, 2, 3, 4, 5].map((value) => (
        <Star
          key={value}
          className="size-4"
          fill={value <= rating ? 'currentColor' : 'none'}
          aria-hidden="true"
        />
      ))}
    </div>
  );
}

function formatBookingRange(start: string | null, end: string | null, locale: 'vi' | 'en') {
  if (!start && !end) return null;
  const formatter = new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'vi-VN', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Asia/Ho_Chi_Minh',
  });
  if (start && end) return `${formatter.format(new Date(start))} – ${formatter.format(new Date(end))}`;
  return formatter.format(new Date(start ?? end ?? ''));
}

function formatTime(value: string, locale: 'vi' | 'en') {
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(new Date(value));
}

function formatRelativeTime(value: string, locale: 'vi' | 'en') {
  const days = Math.round((new Date(value).getTime() - Date.now()) / 86_400_000);
  if (Math.abs(days) < 1) return locale === 'en' ? 'Today' : 'Hôm nay';
  return new Intl.RelativeTimeFormat(locale === 'en' ? 'en-US' : 'vi-VN', {
    numeric: 'auto',
  }).format(days, 'day');
}

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || '?'
  );
}
