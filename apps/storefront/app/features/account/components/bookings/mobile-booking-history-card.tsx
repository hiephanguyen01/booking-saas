import type { CustomerReviewItem } from '@booking/contracts';
import type { Locale } from '@booking/i18n';
import { NsI18n, useTranslation } from '@booking/i18n';
import { Image } from '@booking/ui/components/media/image';
import { Button } from '@booking/ui/components/ui/button';
import { CalendarDays, ChevronRight, MessageCircle } from 'lucide-react';
import { Link } from 'react-router';
import { ListingThumbnail } from '~/components/listing-thumbnail';
import { storefrontPaths } from '~/constants/paths';
import type { BookingDetailViewModel } from '~/features/booking/lib/booking-detail-model';
import { BookingStatusBadge } from '~/features/account/components/shared/booking-status-badge';
import { BookingFinancialSummary } from './booking-financial-summary';
import { BookingPaymentForm } from './booking-payment-form';

type PendingReview = Extract<CustomerReviewItem, { status: 'pending' }>;

export function MobileBookingHistoryCard({
  booking,
  locale,
  canDispute,
  onReview,
  onCancel,
  onDispute,
}: {
  booking: BookingDetailViewModel;
  locale: Locale;
  canDispute: boolean;
  onReview: (review: PendingReview) => void;
  onCancel: (booking: BookingDetailViewModel) => void;
  onDispute: (booking: BookingDetailViewModel) => void;
}) {
  const { t } = useTranslation(NsI18n.Account);
  const detailPath = storefrontPaths.account.booking(locale, booking.code);

  return (
    <article className="overflow-hidden rounded-2xl border border-border bg-card shadow-(--sf-surface-shadow)">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-foreground">{booking.partnerName}</p>
          <p className="mt-0.5 font-mono text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
            {booking.code}
          </p>
        </div>
        <BookingStatusBadge status={booking.status} />
      </div>

      <Link
        to={detailPath}
        className="grid grid-cols-[6.25rem_minmax(0,1fr)] gap-3 p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        {booking.imageUrl ? (
          <Image
            src={booking.imageUrl}
            alt={booking.listingTitle}
            className="aspect-square size-full rounded-xl object-cover object-top"
          />
        ) : (
          <ListingThumbnail
            label={booking.listingTitle}
            className="aspect-square size-full rounded-xl border border-border"
          />
        )}
        <div className="min-w-0">
          <h2 className="line-clamp-2 text-sm font-bold leading-5">{booking.listingTitle}</h2>
          {booking.resourceName ? (
            <p className="mt-1 truncate text-xs text-muted-foreground">{booking.resourceName}</p>
          ) : null}
          <p className="mt-2 flex items-start gap-1.5 text-xs leading-4 text-muted-foreground">
            <CalendarDays className="mt-px size-3.5 shrink-0 text-primary" aria-hidden="true" />
            <span>{booking.dateLabel}</span>
          </p>
          <p className="mt-1 text-xs font-medium text-foreground">{booking.timeLabel}</p>
        </div>
      </Link>

      <BookingFinancialSummary
        paidAmount={booking.paidAmount}
        finalAmount={booking.finalAmount}
        balanceAmount={booking.balanceAmount}
        locale={locale}
        className="mx-4 mb-3"
      />

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border bg-muted/20 px-3 py-3">
        <Button asChild variant="ghost" size="sm" className="mr-auto min-h-11 px-3">
          <Link to={storefrontPaths.account.messages(locale)}>
            <MessageCircle className="size-4" aria-hidden="true" />
            {t('bookings.chat')}
          </Link>
        </Button>
        {booking.status === 'confirmed' ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-11"
            onClick={() => onCancel(booking)}
          >
            {t('bookings.cancel')}
          </Button>
        ) : null}
        {booking.variant === 'payment' ? (
          <BookingPaymentForm
            action={detailPath}
            buttonProps={{ size: 'sm', className: 'min-h-11' }}
          >
            {t('bookings.payNow')}
          </BookingPaymentForm>
        ) : null}
        {booking.variant === 'completed' && booking.review?.status === 'pending' ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-11"
            onClick={() => onReview(booking.review as PendingReview)}
          >
            {t('bookings.review')}
          </Button>
        ) : null}
        {canDispute ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-11"
            onClick={() => onDispute(booking)}
          >
            {t('bookings.dispute')}
          </Button>
        ) : null}
        <Button
          asChild
          size="icon"
          variant="ghost"
          className="size-11"
          aria-label={t('bookings.detail')}
        >
          <Link to={detailPath}>
            <ChevronRight className="size-4" aria-hidden="true" />
          </Link>
        </Button>
      </div>
    </article>
  );
}
