import type { Locale } from '@booking/i18n';
import { Button } from '@booking/ui/components/ui/button';
import { CalendarDays, Clock3, PackageCheck, Users } from 'lucide-react';
import { Link } from 'react-router';
import { NsI18n, useTranslation } from '~/lib/i18n';
import { storefrontPaths } from '~/lib/locale-paths';
import type {
  AccountBookingViewModel,
  BookingDetailState,
} from '~/features/account/lib/booking-history';
import { CancellationPolicyList, StudioThumbnail } from './account-primitives';
import { BookingCardHeader } from './booking-card-header';
import { BookingPaymentForm } from './booking-payment-form';
import { CancelBookingDialog } from './cancel-booking-dialog';
import { useBookingDetailOverviewController } from './use-booking-detail-overview-controller';

export function BookingDetailOverview({
  booking,
  locale,
  state,
  defaultCancelOpen,
}: {
  booking: AccountBookingViewModel;
  locale: Locale;
  state: BookingDetailState;
  defaultCancelOpen: boolean;
}) {
  const controller = useBookingDetailOverviewController({ booking, state, defaultCancelOpen });

  return (
    <section className="overflow-hidden bg-background shadow-[0_3px_14px_rgba(15,23,42,0.035)]">
      <BookingCardHeader
        partnerName={booking.partnerName}
        listingSlug={booking.listingSlug}
        bookingCode={booking.code}
        status={booking.status}
        locale={locale}
        createdAt={booking.createdAt}
      />
      <ListingSummary
        booking={booking}
        mode={controller.mode}
        isInventory={controller.isInventory}
        participantCount={controller.participantCount}
      />
      <PolicyActions
        booking={booking}
        locale={locale}
        state={state}
        canPay={controller.canPay}
        canCancel={controller.canCancel}
        canDispute={controller.canDispute}
        cancelOpen={controller.cancelOpen}
        setCancelOpen={controller.setCancelOpen}
        showActions={controller.showActions}
      />
    </section>
  );
}

function ListingSummary({
  booking,
  mode,
  isInventory,
  participantCount,
}: {
  booking: AccountBookingViewModel;
  mode: 'hourly' | 'daily' | 'inventory' | 'other';
  isInventory: boolean;
  participantCount: string;
}) {
  const { t } = useTranslation(NsI18n.Account);

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
          icon={isInventory ? PackageCheck : Users}
          label={isInventory ? t('bookings.quantity') : t('bookings.guests')}
          value={participantCount}
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
  canPay,
  canCancel,
  canDispute,
  cancelOpen,
  setCancelOpen,
  showActions,
}: {
  booking: AccountBookingViewModel;
  locale: Locale;
  state: BookingDetailState;
  canPay: boolean;
  canCancel: boolean;
  canDispute: boolean;
  cancelOpen: boolean;
  setCancelOpen: (open: boolean) => void;
  showActions: boolean;
}) {
  const { t } = useTranslation(NsI18n.Account);

  if (!showActions) return null;

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
          <BookingPaymentForm
            buttonProps={{
              className: 'h-10 rounded-sm bg-[#ff3f44] px-6 text-white hover:bg-[#e93439]',
            }}
          >
            {t('bookings.payNow')}
          </BookingPaymentForm>
        ) : null}
        {canCancel ? (
          <>
            <Button
              type="button"
              variant="outline"
              className="h-10 rounded-sm border-[#263247] bg-[#4b5669] px-6 text-white hover:bg-[#3f495a] hover:text-white"
              onClick={() => setCancelOpen(true)}
            >
              {t('bookings.cancel')}
            </Button>
            <CancelBookingDialog
              booking={booking}
              locale={locale}
              open={cancelOpen}
              onOpenChange={setCancelOpen}
            />
          </>
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
