import type { CustomerReviewItem } from '@booking/contracts';
import type { Locale } from '@booking/i18n';
import { Button } from '@booking/ui/components/ui/button';
import { CalendarDays, Clock3 } from 'lucide-react';
import { Form, Link } from 'react-router';
import { NsI18n, useTranslation } from '../../../lib/i18n';
import { storefrontPaths } from '../../../lib/locale-paths';
import type { AccountBookingViewModel } from '../lib/booking-history';
import { AccountPanel, CancellationPolicyList, StudioThumbnail } from './account-primitives';
import { BookingCardHeader } from './booking-card-header';
import { BookingFinancialSummary } from './booking-financial-summary';

export function BookingHistoryCard({
  booking,
  locale,
  onReview,
}: {
  booking: AccountBookingViewModel;
  locale: Locale;
  onReview: (review: Extract<CustomerReviewItem, { status: 'pending' }>) => void;
}) {
  const { t } = useTranslation([NsI18n.Account, NsI18n.Booking]);
  const detailPath = storefrontPaths.account.booking(locale, booking.code);

  return (
    <AccountPanel className="overflow-hidden rounded-xl border border-border/70 shadow-[0_10px_35px_rgba(15,23,42,0.045)]">
      <BookingCardHeader
        partnerName={booking.partnerName}
        listingSlug={booking.listingSlug}
        bookingCode={booking.code}
        status={booking.status}
        locale={locale}
        createdAt={booking.createdAt}
      />

      <div className="px-5 py-5 sm:px-6">
        <div className="grid gap-4 sm:grid-cols-[158px_minmax(0,1fr)]">
          {booking.imageUrl ? (
            <img
              src={booking.imageUrl}
              alt={booking.listingTitle}
              className="aspect-[4/3] w-full rounded-lg object-cover"
            />
          ) : (
            <StudioThumbnail
              label={booking.listingTitle}
              className="aspect-[4/3] w-full rounded-lg border border-border/70"
            />
          )}
          <div className="min-w-0">
            <Link
              to={detailPath}
              className="block text-base font-semibold leading-6 text-foreground hover:text-primary"
            >
              {booking.listingTitle}
            </Link>
            <p className="mt-1 text-sm text-muted-foreground">{booking.resourceName}</p>
            <p className="mt-3 flex items-start gap-2 text-sm leading-5 text-muted-foreground">
              <CalendarDays className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
              <span>{booking.dateLabel}</span>
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium text-foreground">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1.5">
                <Clock3 className="size-3.5 text-muted-foreground" aria-hidden="true" />
                {booking.timeLabel}
              </span>
              <span className="rounded-full bg-muted px-2.5 py-1.5">{booking.durationLabel}</span>
            </div>
          </div>
        </div>

        {booking.customerNote ? (
          <div className="mt-4 rounded-lg bg-muted/45 px-4 py-3 text-sm">
            <p className="text-xs font-medium text-muted-foreground">
              {t('account:bookings.contact.note')}
            </p>
            <p className="mt-1 leading-5">{booking.customerNote}</p>
          </div>
        ) : null}
      </div>

      <BookingFinancialSummary
        paidAmount={booking.paidAmount}
        finalAmount={booking.finalAmount}
        balanceAmount={booking.balanceAmount}
        locale={locale}
        className="mx-5 mb-5 sm:mx-6"
      />

      <CardFooter
        booking={booking}
        detailPath={detailPath}
        locale={locale}
        onReview={onReview}
      />
    </AccountPanel>
  );
}

function CardFooter({
  booking,
  detailPath,
  locale,
  onReview,
}: {
  booking: AccountBookingViewModel;
  detailPath: string;
  locale: Locale;
  onReview: (review: Extract<CustomerReviewItem, { status: 'pending' }>) => void;
}) {
  const { t } = useTranslation(NsI18n.Account);
  const review = booking.review;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/70 bg-muted/15 px-5 py-4 sm:px-6">
      <PolicyNotes booking={booking} locale={locale} />
      <div className="flex flex-wrap gap-2">
        {booking.variant === 'upcoming' ? (
          <Button asChild variant="outline" size="sm">
            <Link to={`${detailPath}?cancel=1`}>{t('bookings.cancel')}</Link>
          </Button>
        ) : null}
        {booking.variant === 'payment' ? (
          <Form method="post" action={detailPath}>
            <input type="hidden" name="intent" value="pay" />
            <Button size="sm">{t('bookings.payNow')}</Button>
          </Form>
        ) : null}
        {booking.variant === 'completed' && review?.status === 'pending' ? (
          <Button type="button" variant="outline" size="sm" onClick={() => onReview(review)}>
            {t('bookings.review')}
          </Button>
        ) : null}
        {booking.variant === 'completed' && review?.status === 'reviewed' ? (
          <Button asChild variant="outline" size="sm">
            <Link to={detailPath}>{t('reviews.reviewed')}</Link>
          </Button>
        ) : null}
        {booking.variant === 'no-show' ? (
          <Button asChild variant="outline" size="sm">
            <Link to={storefrontPaths.account.help(locale)}>{t('bookings.dispute')}</Link>
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function PolicyNotes({ booking, locale }: { booking: AccountBookingViewModel; locale: Locale }) {
  const { t } = useTranslation(NsI18n.Account);
  if (booking.variant === 'cancelled') {
    return (
      <div className="space-y-1 text-xs text-muted-foreground">
        <p>{t('bookings.refundPreview', { percent: booking.refundPercent ?? 0 })}</p>
        <p>{t('bookings.refundTiming')}</p>
      </div>
    );
  }
  if (booking.variant === 'no-show') {
    return (
      <div className="space-y-1 text-xs text-muted-foreground">
        <p>{t('bookings.noRefund')}</p>
        <p>{t('bookings.disputeHint')}</p>
      </div>
    );
  }
  if (!booking.cancellationTiers.length || booking.variant === 'completed') return null;

  return <CancellationPolicyList booking={booking} locale={locale} />;
}
