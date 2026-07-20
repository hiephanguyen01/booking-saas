import { formatDateTime, type Locale } from '@booking/i18n';
import { Button } from '@booking/ui/components/ui/button';
import {
  Building2,
  CalendarDays,
  Clock3,
  MessageSquareText,
  PackageCheck,
  Users,
} from 'lucide-react';
import { Form, Link } from 'react-router';
import { NsI18n, useTranslation } from '../../../lib/i18n';
import { storefrontPaths } from '../../../lib/locale-paths';
import type { AccountBookingViewModel, BookingDetailState } from '../lib/booking-history';
import { CancellationPolicyList, StudioThumbnail } from './account-primitives';
import { BookingStatusBadge } from './booking-status-badge';
import { CancelBookingDialog } from './cancel-booking-dialog';

export function BookingDetailOverview({
  booking,
  locale,
  state,
  defaultCancelOpen,
  actionError,
}: {
  booking: AccountBookingViewModel;
  locale: Locale;
  state: BookingDetailState;
  defaultCancelOpen: boolean;
  actionError: string | null;
}) {
  return (
    <section className="overflow-hidden bg-background shadow-[0_3px_14px_rgba(15,23,42,0.035)]">
      <StudioHeader booking={booking} locale={locale} />
      <ListingSummary booking={booking} />
      <PolicyActions
        booking={booking}
        locale={locale}
        state={state}
        defaultCancelOpen={defaultCancelOpen}
        actionError={actionError}
      />
    </section>
  );
}

function StudioHeader({ booking, locale }: { booking: AccountBookingViewModel; locale: Locale }) {
  const { t } = useTranslation(NsI18n.Account);
  return (
    <header className="mx-5 flex min-h-18 flex-col justify-center gap-3 border-b border-[#d8dee8] py-4 sm:mx-6 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-wrap items-center gap-3 sm:gap-5">
        <p className="inline-flex min-w-0 items-center gap-2 text-sm font-medium text-[#263247]">
          <Building2 aria-hidden="true" className="size-4 shrink-0" />
          <span className="truncate">{booking.partnerName}</span>
        </p>
        <Button
          asChild
          variant="outline"
          size="sm"
          className="h-9 rounded-sm border-primary px-4 text-primary hover:bg-primary/5 hover:text-primary"
        >
          <Link to={storefrontPaths.account.messages(locale)}>
            <MessageSquareText aria-hidden="true" className="size-4" />
            {t('bookings.chat')}
          </Link>
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-[#263247] sm:justify-end">
        <span className="font-medium uppercase">
          {t('bookings.bookingCode', { code: booking.code })}
        </span>
        <span aria-hidden="true" className="h-4 w-px bg-[#cbd2dc]" />
        <BookingStatusBadge status={booking.status} />
        <span className="sr-only">
          {t('bookings.placedAt', {
            date: formatDateTime(booking.createdAt, locale, 'Asia/Ho_Chi_Minh'),
          })}
        </span>
      </div>
    </header>
  );
}

function ListingSummary({ booking }: { booking: AccountBookingViewModel }) {
  const { t } = useTranslation(NsI18n.Account);
  const mode =
    booking.bookingMode === 'hourly' ||
    booking.bookingMode === 'daily' ||
    booking.bookingMode === 'inventory'
      ? booking.bookingMode
      : 'other';

  return (
    <div className="px-5 pb-0 pt-5 sm:px-6">
      <div className="grid gap-4 sm:grid-cols-[166px_minmax(0,1fr)]">
        {booking.imageUrl ? (
          <img
            src={booking.imageUrl}
            alt={booking.listingTitle}
            className="aspect-[4/3] w-full object-cover"
          />
        ) : (
          <StudioThumbnail
            label={booking.listingTitle}
            className="aspect-[4/3] w-full border border-[#d8dee8]"
          />
        )}
        <div className="min-w-0">
          <h2 className="text-sm font-semibold leading-6 text-[#263247]">{booking.listingTitle}</h2>
          {booking.resourceName ? (
            <p className="mt-0.5 text-xs text-muted-foreground">{booking.resourceName}</p>
          ) : null}
          <p className="mt-2 flex items-start gap-2 text-xs text-[#4d5a70]">
            <CalendarDays aria-hidden="true" className="mt-px size-4 shrink-0" />
            <span>{booking.dateLabel}</span>
          </p>
          <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-[#4d5a70]">
            <span className="inline-flex items-center gap-1 rounded-full bg-[#f1f3f7] px-2 py-1">
              <Clock3 aria-hidden="true" className="size-3" />
              {booking.timeLabel}
            </span>
            <span className="rounded-full bg-[#f1f3f7] px-2 py-1">{booking.durationLabel}</span>
          </div>
        </div>
      </div>

      <dl className="mt-5 space-y-2 text-xs leading-5 text-[#4d5a70]">
        <BookingFact
          icon={PackageCheck}
          label={t('bookings.bookingType')}
          value={t(`bookings.modes.${mode}`)}
        />
        <BookingFact
          icon={booking.bookingMode === 'inventory' ? PackageCheck : Users}
          label={
            booking.bookingMode === 'inventory' ? t('bookings.quantity') : t('bookings.guests')
          }
          value={String(
            booking.bookingMode === 'inventory' ? booking.quantity : booking.guestCount,
          )}
        />
        {booking.attributes.map((attribute) => (
          <BookingFact
            key={`${attribute.label}-${attribute.value}`}
            icon={PackageCheck}
            label={attribute.label}
            value={attribute.value}
          />
        ))}
      </dl>

      {booking.listingDescription ? (
        <p className="mt-4 border-t border-[#d8dee8] py-4 text-xs leading-5 text-[#5b6678]">
          {booking.listingDescription}
        </p>
      ) : (
        <div className="mt-4 border-t border-[#d8dee8]" />
      )}
    </div>
  );
}

function BookingFact({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof CalendarDays;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-[#263247]" />
      <dt className="font-semibold text-[#263247]">{label}:</dt>
      <dd className="min-w-0 break-words">{value}</dd>
    </div>
  );
}

function PolicyActions({
  booking,
  locale,
  state,
  defaultCancelOpen,
  actionError,
}: {
  booking: AccountBookingViewModel;
  locale: Locale;
  state: BookingDetailState;
  defaultCancelOpen: boolean;
  actionError: string | null;
}) {
  const { t } = useTranslation(NsI18n.Account);
  const canPay = booking.status === 'pending_payment';
  const canCancel = booking.status === 'confirmed';
  const canDispute = state === 'absent';
  const showPolicy =
    booking.cancellationTiers.length > 0 || state === 'cancelled' || state === 'absent';

  if (!showPolicy && !canPay && !canCancel && !canDispute) return null;

  return (
    <div className="mx-5 flex flex-col gap-4 border-t border-[#d8dee8] py-4 sm:mx-6 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 text-xs leading-5 text-[#4d5a70]">
        {state === 'cancelled' ? (
          <div className="space-y-1">
            <p>· {t('bookings.refundPreview', { percent: booking.refundPercent ?? 0 })}</p>
            <p>· {t('bookings.refundTiming')}</p>
          </div>
        ) : state === 'absent' ? (
          <div className="space-y-1">
            <p>· {t('bookings.noRefund')}</p>
            <p>· {t('bookings.disputeHint')}</p>
          </div>
        ) : (
          <CancellationPolicyList booking={booking} locale={locale} />
        )}
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        {canPay ? (
          <Form method="post">
            <input type="hidden" name="intent" value="pay" />
            <Button className="h-10 rounded-sm bg-[#ff3f44] px-6 text-white hover:bg-[#e93439]">
              {t('bookings.payNow')}
            </Button>
          </Form>
        ) : null}
        {canCancel ? (
          <CancelBookingDialog
            booking={booking}
            locale={locale}
            defaultOpen={defaultCancelOpen}
            serverError={actionError}
          />
        ) : null}
        {canDispute ? (
          <Button
            asChild
            variant="outline"
            className="h-10 rounded-sm border-[#263247] px-6 text-[#263247]"
          >
            <Link to={storefrontPaths.account.help(locale)}>{t('bookings.dispute')}</Link>
          </Button>
        ) : null}
      </div>
    </div>
  );
}
