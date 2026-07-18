import { formatCurrency, type Locale } from '@booking/i18n';
import { Badge } from '@booking/ui/components/ui/badge';
import { Button } from '@booking/ui/components/ui/button';
import { CalendarDays, Check, MessageSquareText } from 'lucide-react';
import { Form, Link } from 'react-router';
import { NsI18n, useTranslation } from '../../../lib/i18n';
import { storefrontPaths } from '../../../lib/locale-paths';
import type { AccountBookingViewModel } from '../lib/booking-history';
import { AccountPanel } from './account-primitives';

const STATUS_CLASS = {
  payment: 'text-destructive',
  upcoming: 'text-amber-600',
  completed: 'text-emerald-600',
  cancelled: 'text-destructive',
  'no-show': 'text-destructive',
} as const;

export function BookingHistoryCard({
  booking,
  locale,
}: {
  booking: AccountBookingViewModel;
  locale: Locale;
}) {
  const { t } = useTranslation([NsI18n.Account, NsI18n.Booking]);
  const detailPath = storefrontPaths.account.booking(locale, booking.code);

  return (
    <AccountPanel className="overflow-hidden rounded-none shadow-[0_7px_24px_rgba(15,23,42,0.04)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4 sm:px-6">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <p className="truncate text-sm font-medium">{booking.studioName}</p>
          <Button
            asChild
            variant="outline"
            size="sm"
            className="h-8 rounded-sm px-3 text-xs text-primary"
          >
            <Link to={storefrontPaths.account.messages(locale)}>
              <MessageSquareText className="size-3.5" />
              {t('account:bookings.chat')}
            </Link>
          </Button>
        </div>
        <div className="flex items-center gap-2 text-xs font-medium">
          <Link to={detailPath} className="hover:text-primary hover:underline">
            {t('booking:code')} {booking.code}
          </Link>
          <span className="h-4 w-px bg-border" />
          <span className={STATUS_CLASS[booking.variant]}>
            {t(`booking:statusLabels.${booking.status}`)}
          </span>
        </div>
      </div>

      <Link
        to={detailPath}
        className="grid gap-4 px-5 py-5 transition-colors hover:bg-muted/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:grid-cols-[158px_minmax(0,1fr)] sm:px-6"
      >
        <img
          src={booking.imageUrl}
          alt=""
          className="h-32 w-full rounded-sm object-cover sm:h-28"
        />
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-5">{booking.listingTitle}</p>
          <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <CalendarDays className="size-4 shrink-0" />
            {booking.dateLabel}
          </p>
          <Badge variant="secondary" className="mt-3 rounded-sm font-normal">
            {booking.timeLabel} ({booking.durationLabel})
          </Badge>
          <p className="mt-3 text-sm font-semibold text-primary sm:hidden">
            {formatCurrency(Number(booking.finalAmount), 'VND', locale)}
          </p>
        </div>
      </Link>

      <CardFooter booking={booking} locale={locale} detailPath={detailPath} />
    </AccountPanel>
  );
}

function CardFooter({
  booking,
  locale,
  detailPath,
}: {
  booking: AccountBookingViewModel;
  locale: Locale;
  detailPath: string;
}) {
  const { t } = useTranslation(NsI18n.Account);

  if (booking.variant === 'payment') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border px-5 py-4 sm:px-6">
        <PolicyPreview booking={booking} />
        {booking.status === 'pending_payment' && !booking.demo ? (
          <Form method="post" action={detailPath}>
            <input type="hidden" name="intent" value="pay" />
            <Button className="h-10 rounded-sm">{t('bookings.payNow')}</Button>
          </Form>
        ) : (
          <Button asChild className="h-10 rounded-sm">
            <Link to={detailPath}>{t('bookings.payNow')}</Link>
          </Button>
        )}
      </div>
    );
  }

  if (booking.variant === 'upcoming') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border px-5 py-4 sm:px-6">
        <PolicyPreview booking={booking} />
        <Button
          asChild
          variant="secondary"
          className="h-10 rounded-sm bg-slate-700 text-white hover:bg-slate-800"
        >
          <Link to={`${detailPath}?cancel=1`}>{t('bookings.cancel')}</Link>
        </Button>
      </div>
    );
  }

  if (booking.variant === 'completed') {
    return (
      <div className="flex justify-end border-t border-border px-5 py-4 sm:px-6">
        <Button
          asChild
          variant="outline"
          className="h-10 rounded-sm border-primary text-primary hover:text-primary"
        >
          <Link to={detailPath}>{t('bookings.review')}</Link>
        </Button>
      </div>
    );
  }

  if (booking.variant === 'no-show') {
    return (
      <div className="flex flex-wrap items-end justify-between gap-4 border-t border-border px-5 py-4 sm:px-6">
        <ul className="space-y-2 text-xs text-muted-foreground">
          <li>· {t('bookings.noRefund')}</li>
          <li>· {t('bookings.disputeHint')}</li>
        </ul>
        <Button asChild variant="outline" className="h-10 rounded-sm">
          <Link to={storefrontPaths.account.help(locale)}>{t('bookings.dispute')}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="border-t border-border px-5 py-4 sm:px-6">
      <ul className="space-y-2 text-xs text-muted-foreground">
        <li>· {t('bookings.refundPreview')}</li>
        <li>· {t('bookings.refundTiming')}</li>
      </ul>
    </div>
  );
}

function PolicyPreview({ booking }: { booking: AccountBookingViewModel }) {
  const { t } = useTranslation(NsI18n.Account);
  const firstTier = booking.cancellationTiers[0];
  const lastTier = booking.cancellationTiers.at(-1);
  return (
    <div className="space-y-2 text-xs text-muted-foreground">
      <p className="flex items-center gap-2 text-emerald-600">
        <Check className="size-3.5" />
        {firstTier?.refundPercent === 100
          ? t('bookings.freeCancellation')
          : t('bookings.policyAvailable')}
      </p>
      {lastTier ? (
        <p className="flex items-center gap-2">
          <Check className="size-3.5 text-emerald-600" />
          {t('bookings.lateCancellation', { percent: lastTier.refundPercent })}
        </p>
      ) : null}
    </div>
  );
}
