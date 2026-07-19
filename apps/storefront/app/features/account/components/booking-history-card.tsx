import { formatCurrency, formatDateTime, type Locale } from '@booking/i18n';
import { Button } from '@booking/ui/components/ui/button';
import {
  CalendarDays,
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
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/70 bg-muted/20 px-5 py-4 sm:px-6">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
            {t('account:bookings.order')}
          </p>
          <Link
            to={detailPath}
            className="mt-1 inline-block font-mono text-sm font-semibold tracking-tight hover:text-primary hover:underline"
          >
            {booking.code}
          </Link>
          <p className="mt-1 text-xs text-muted-foreground">
            {t('account:bookings.placedAt', {
              date: formatDateTime(booking.createdAt, locale, 'Asia/Ho_Chi_Minh'),
            })}
          </p>
        </div>
        <BookingStatusBadge status={booking.status} />
      </div>

      <div className="grid gap-6 px-5 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_240px]">
        <div className="min-w-0">
          <div className="grid gap-4 sm:grid-cols-[152px_minmax(0,1fr)]">
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
              <p className="text-xs font-medium text-primary">{booking.partnerName}</p>
              <Link
                to={detailPath}
                className="mt-1 block text-base font-semibold leading-6 text-foreground hover:text-primary"
              >
                {booking.listingTitle}
              </Link>
              <p className="mt-1 text-sm text-muted-foreground">{booking.resourceName}</p>
              {booking.listingDescription ? (
                <p className="mt-3 line-clamp-2 text-sm leading-5 text-muted-foreground">
                  {booking.listingDescription}
                </p>
              ) : null}
            </div>
          </div>

          <dl className="mt-5 grid gap-x-5 gap-y-4 border-t border-border/70 pt-5 sm:grid-cols-2">
            <Fact
              icon={CalendarDays}
              label={t('account:bookings.schedule')}
              value={booking.dateLabel}
            />
            <Fact
              icon={Clock3}
              label={t('account:bookings.timeAndDuration')}
              value={`${booking.timeLabel} · ${booking.durationLabel}`}
            />
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

          {booking.customerNote ? (
            <div className="mt-5 rounded-lg bg-muted/45 px-4 py-3 text-sm">
              <p className="text-xs font-medium text-muted-foreground">
                {t('account:bookings.contact.note')}
              </p>
              <p className="mt-1 leading-5">{booking.customerNote}</p>
            </div>
          ) : null}

          <BookingExtras booking={booking} locale={locale} />
        </div>

        <aside className="border-t border-border/70 pt-5 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
            {t('account:bookings.payment.summary')}
          </p>
          <MoneyRow
            label={t('account:bookings.payment.original')}
            value={booking.totalAmount}
            locale={locale}
          />
          {BigInt(booking.discountAmount) > 0n ? (
            <MoneyRow
              label={t('account:bookings.payment.discount')}
              value={`-${booking.discountAmount}`}
              locale={locale}
              accent
            />
          ) : null}
          <MoneyRow
            label={t('account:bookings.payment.total')}
            value={booking.finalAmount}
            locale={locale}
            strong
          />
          <MoneyRow
            label={t('account:bookings.payment.paid')}
            value={booking.paidAmount}
            locale={locale}
          />
          <MoneyRow
            label={t('account:bookings.payment.balance')}
            value={booking.balanceAmount}
            locale={locale}
            strong={BigInt(booking.balanceAmount) > 0n}
          />
          {booking.promoCode ? (
            <p className="mt-4 flex items-center gap-2 rounded-lg bg-primary/5 px-3 py-2 text-xs font-medium text-primary">
              <TicketPercent className="size-4" /> {booking.promoCode}
            </p>
          ) : null}
        </aside>
      </div>

      <CardFooter booking={booking} locale={locale} detailPath={detailPath} />
    </AccountPanel>
  );
}

function BookingExtras({ booking, locale }: { booking: AccountBookingViewModel; locale: Locale }) {
  const { t } = useTranslation(NsI18n.Account);
  const hasExtras =
    booking.pricingLineItems.length > 0 ||
    booking.additionalCharges.length > 0 ||
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
    <div className="grid grid-cols-[20px_1fr] gap-2.5">
      <Icon className="mt-0.5 size-4 text-primary" aria-hidden="true" />
      <div>
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="mt-0.5 text-sm font-medium leading-5">{value}</dd>
      </div>
    </div>
  );
}

function MoneyRow({
  label,
  value,
  locale,
  strong = false,
  accent = false,
}: {
  label: string;
  value: string;
  locale: Locale;
  strong?: boolean;
  accent?: boolean;
}) {
  const negative = value.startsWith('-');
  const amount = negative ? value.slice(1) : value;
  return (
    <div className={`flex justify-between gap-3 pt-3 text-sm ${strong ? 'font-semibold' : ''}`}>
      <span className="text-muted-foreground">{label}</span>
      <span className={accent ? 'text-emerald-700' : ''}>
        {negative ? '−' : ''}
        {money(amount, locale)}
      </span>
    </div>
  );
}

function ExtraRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
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
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/70 bg-muted/15 px-5 py-4 sm:px-6">
      <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
        <Link to={storefrontPaths.account.messages(locale)}>
          <MessageSquareText className="size-4" /> {t('bookings.chat')}
        </Link>
      </Button>
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

function money(value: string, locale: Locale): string {
  return formatCurrency(BigInt(value), 'VND', locale);
}
