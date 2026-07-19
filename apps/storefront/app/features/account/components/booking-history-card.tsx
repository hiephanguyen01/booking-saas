import { formatCurrency, formatDateTime, type Locale } from '@booking/i18n';
import { Button } from '@booking/ui/components/ui/button';
import {
  CalendarDays,
  Check,
  Clock3,
  MessageSquareText,
  PackageCheck,
  ReceiptText,
  TicketPercent,
  Users,
} from 'lucide-react';
import { Form, Link } from 'react-router';
import { NsI18n, useTranslation } from '../../../lib/i18n';
import { storefrontPaths } from '../../../lib/locale-paths';
import type { AccountBookingViewModel } from '../lib/booking-history';
import { AccountPanel, StudioThumbnail } from './account-primitives';
import { BookingFinancialSummary } from './booking-financial-summary';
import { BookingStatusBadge } from './booking-status-badge';

export function BookingHistoryCard({
  booking,
  locale,
}: {
  booking: AccountBookingViewModel;
  locale: Locale;
}) {
  const { t } = useTranslation([NsI18n.Account, NsI18n.Booking]);
  const detailPath = storefrontPaths.account.booking(locale, booking.code);
  const mode =
    booking.bookingMode === 'hourly' ||
    booking.bookingMode === 'daily' ||
    booking.bookingMode === 'inventory'
      ? booking.bookingMode
      : 'other';

  return (
    <AccountPanel className="overflow-hidden rounded-xl border border-border/70 shadow-[0_10px_35px_rgba(15,23,42,0.045)]">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 px-5 py-4 sm:px-6">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <p className="truncate text-sm font-medium">{booking.partnerName}</p>
          <Button asChild variant="ghost" size="sm" className="h-8 px-2 text-muted-foreground">
            <Link to={storefrontPaths.account.messages(locale)}>
              <MessageSquareText className="size-4" /> {t('bookings.chat')}
            </Link>
          </Button>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 text-xs">
          <div className="min-w-0">
            <Link
              to={detailPath}
              className="font-mono font-medium hover:text-primary hover:underline"
            >
              {booking.code}
            </Link>
            <p className="mt-0.5 text-muted-foreground">
              {t('account:bookings.placedAt', {
                date: formatDateTime(booking.createdAt, locale, 'Asia/Ho_Chi_Minh'),
              })}
            </p>
          </div>
          <BookingStatusBadge status={booking.status} />
        </div>
      </header>

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
            {booking.listingDescription ? (
              <p className="mt-3 line-clamp-2 text-sm leading-5 text-muted-foreground">
                {booking.listingDescription}
              </p>
            ) : null}
            <dl className="mt-4 flex flex-wrap gap-x-4 gap-y-2 border-t border-border/60 pt-3 text-xs">
              <Fact
                icon={PackageCheck}
                label={t('account:bookings.bookingType')}
                value={t(`account:bookings.modes.${mode}`)}
              />
              <Fact
                icon={booking.bookingMode === 'inventory' ? PackageCheck : Users}
                label={
                  booking.bookingMode === 'inventory'
                    ? t('account:bookings.quantity')
                    : t('account:bookings.guests')
                }
                value={String(
                  booking.bookingMode === 'inventory' ? booking.quantity : booking.guestCount,
                )}
              />
            </dl>
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

        <BookingExtras booking={booking} locale={locale} />
      </div>

      <BookingFinancialSummary
        paidAmount={booking.paidAmount}
        finalAmount={booking.finalAmount}
        balanceAmount={booking.balanceAmount}
        locale={locale}
        className="mx-5 mb-5 sm:mx-6"
      />

      <CardFooter booking={booking} detailPath={detailPath} />
    </AccountPanel>
  );
}

function BookingExtras({ booking, locale }: { booking: AccountBookingViewModel; locale: Locale }) {
  const { t } = useTranslation(NsI18n.Account);
  const hasExtras =
    booking.pricingLineItems.length > 0 ||
    booking.additionalCharges.length > 0 ||
    BigInt(booking.discountAmount) > 0n ||
    booking.promoCode ||
    booking.pickedUpAt ||
    booking.returnedAt ||
    BigInt(booking.securityDeposit) > 0n;
  if (!hasExtras) return null;

  return (
    <details className="group mt-5 border-t border-border/70 pt-4">
      <summary className="cursor-pointer list-none text-sm font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {t('bookings.orderBreakdown')}
      </summary>
      <dl className="mt-3 divide-y divide-border/60 text-sm">
        {BigInt(booking.discountAmount) > 0n ? (
          <ExtraRow
            label={t('bookings.payment.discount')}
            value={`−${money(booking.discountAmount, locale)}`}
            accent
          />
        ) : null}
        {booking.promoCode ? (
          <ExtraRow label={t('bookings.payment.discount')} value={booking.promoCode} icon />
        ) : null}
        {booking.pricingLineItems.map((line) => (
          <div
            key={`${line.label}-${line.quantity}-${line.unitPrice}-${line.amount}`}
            className="flex justify-between gap-4 py-2"
          >
            <dt className="text-muted-foreground">
              {line.label} × {line.quantity}
            </dt>
            <dd className="shrink-0 font-medium">{money(line.amount, locale)}</dd>
          </div>
        ))}
        {BigInt(booking.securityDeposit) > 0n ? (
          <ExtraRow
            label={t('bookings.payment.securityDeposit')}
            value={money(booking.securityDeposit, locale)}
          />
        ) : null}
        {booking.additionalCharges.map((charge) => (
          <ExtraRow
            key={`${charge.type}-${charge.amount}`}
            label={t('bookings.additionalCharge', { type: charge.type })}
            value={money(charge.amount, locale)}
          />
        ))}
        {booking.pickedUpAt ? (
          <ExtraRow
            label={t('bookings.pickedUpAt')}
            value={formatDateTime(booking.pickedUpAt, locale, 'Asia/Ho_Chi_Minh')}
          />
        ) : null}
        {booking.returnedAt ? (
          <ExtraRow
            label={t('bookings.returnedAt')}
            value={formatDateTime(booking.returnedAt, locale, 'Asia/Ho_Chi_Minh')}
          />
        ) : null}
      </dl>
    </details>
  );
}

function Fact({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof CalendarDays;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

function ExtraRow({
  label,
  value,
  accent = false,
  icon = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
  icon?: boolean;
}) {
  return (
    <div className="flex justify-between gap-4 py-2">
      <dt className="flex items-center gap-1.5 text-muted-foreground">
        {icon ? <TicketPercent className="size-3.5 text-primary" aria-hidden="true" /> : null}
        {label}
      </dt>
      <dd className={`text-right font-medium ${accent ? 'text-emerald-700' : ''}`}>{value}</dd>
    </div>
  );
}

function CardFooter({
  booking,
  detailPath,
}: {
  booking: AccountBookingViewModel;
  detailPath: string;
}) {
  const { t } = useTranslation(NsI18n.Account);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/70 bg-muted/15 px-5 py-4 sm:px-6">
      <PolicyNotes booking={booking} />
      <div className="flex flex-wrap gap-2">
        {booking.status === 'confirmed' ? (
          <Button asChild variant="outline" size="sm">
            <Link to={`${detailPath}?cancel=1`}>{t('bookings.cancel')}</Link>
          </Button>
        ) : null}
        {booking.status === 'pending_payment' ? (
          <Form method="post" action={detailPath}>
            <input type="hidden" name="intent" value="pay" />
            <Button size="sm">{t('bookings.payNow')}</Button>
          </Form>
        ) : (
          <Button asChild size="sm">
            <Link to={detailPath}>
              <ReceiptText className="size-4" /> {t('bookings.detail')}
            </Link>
          </Button>
        )}
      </div>
    </div>
  );
}

function PolicyNotes({ booking }: { booking: AccountBookingViewModel }) {
  const { t } = useTranslation(NsI18n.Account);
  if (booking.variant === 'cancelled') {
    return (
      <div className="space-y-1 text-xs text-muted-foreground">
        <p>{t('bookings.refundPreview')}</p>
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

  return (
    <div className="space-y-1 text-xs text-muted-foreground">
      <p className="flex items-center gap-1.5 text-emerald-700">
        <Check className="size-3.5" aria-hidden="true" /> {t('bookings.freeCancellation')}
      </p>
      <p>
        {t('bookings.lateCancellation', {
          percent: booking.cancellationTiers.at(-1)?.refundPercent ?? 0,
        })}
      </p>
    </div>
  );
}

function money(value: string, locale: Locale): string {
  return formatCurrency(BigInt(value), 'VND', locale);
}
