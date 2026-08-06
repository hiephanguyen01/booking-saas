import type { CustomerBookingSettlementResponse } from '@booking/contracts';
import { formatDateTime, type Locale } from '@booking/i18n';
import { Image } from '@booking/ui/components/media/image';
import { Button } from '@booking/ui/components/ui/button';
import { cn } from '@booking/ui/lib/utils';
import { CalendarDays, Clock3, PackageCheck, Users } from 'lucide-react';
import { NsI18n, useTranslation } from '@booking/i18n';
import { ListingThumbnail } from '~/components/listing-thumbnail';
import type {
  BookingDetailViewModel,
  BookingDetailState,
} from '~/features/booking/lib/booking-detail-model';
import { PANEL_SURFACE } from '~/constants/surfaces';
import { DEFAULT_TZ } from '~/lib/time';
import { CancellationPolicyList } from '~/features/account/components/shared/account-primitives';
import { BookingCardHeader } from '~/features/account/components/shared/booking-card-header';
import { BookingPaymentForm } from '~/features/account/components/bookings/booking-payment-form';
import { CancelBookingDialog } from '~/features/account/components/bookings/cancel-booking-dialog';
import { DisputeBookingDialog } from '~/features/account/components/bookings/dispute-booking-dialog';
import { useBookingDetailOverviewController } from '~/features/account/hooks/use-booking-detail-overview-controller';
import { AttributeSpecCards } from '~/components/attribute-spec-cards';

export function BookingDetailOverview({
  booking,
  locale,
  state,
  defaultCancelOpen,
  settlement,
}: {
  booking: BookingDetailViewModel;
  locale: Locale;
  state: BookingDetailState;
  defaultCancelOpen: boolean;
  settlement: CustomerBookingSettlementResponse | null;
}) {
  const controller = useBookingDetailOverviewController({
    booking,
    state,
    defaultCancelOpen,
    settlement,
  });

  return (
    <section className={cn(PANEL_SURFACE, 'overflow-hidden')}>
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
        disputeUntil={controller.disputeUntil}
        cancelOpen={controller.cancelOpen}
        setCancelOpen={controller.setCancelOpen}
        disputeOpen={controller.disputeOpen}
        setDisputeOpen={controller.setDisputeOpen}
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
  booking: BookingDetailViewModel;
  mode: 'hourly' | 'daily' | 'inventory' | 'other';
  isInventory: boolean;
  participantCount: string;
}) {
  const { t } = useTranslation(NsI18n.Account);

  return (
    <div className="px-5 pb-0 pt-5 sm:px-6">
      <div className="grid gap-4 sm:grid-cols-[166px_minmax(0,1fr)]">
        {booking.imageUrl ? (
          <Image
            src={booking.imageUrl}
            alt={booking.listingTitle}
            className="aspect-[4/3] w-full object-cover"
          />
        ) : (
          <ListingThumbnail
            label={booking.listingTitle}
            className="aspect-[4/3] w-full border border-border"
          />
        )}
        <div className="min-w-0">
          <h2 className="text-sm font-semibold leading-6 text-foreground">
            {booking.listingTitle}
          </h2>
          {booking.resourceName ? (
            <p className="mt-0.5 text-xs text-muted-foreground">{booking.resourceName}</p>
          ) : null}
          {booking.selectedPackageName ? (
            <p className="mt-0.5 text-xs font-medium text-foreground">
              {booking.selectedPackageName}
            </p>
          ) : null}
          <p className="mt-2 flex items-start gap-2 text-xs text-muted-foreground">
            <CalendarDays aria-hidden="true" className="mt-px size-4 shrink-0" />
            <span>{booking.dateLabel}</span>
          </p>
          <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1">
              <Clock3 aria-hidden="true" className="size-3" />
              {booking.timeLabel}
            </span>
            <span className="rounded-full bg-muted px-2 py-1">{booking.durationLabel}</span>
          </div>
        </div>
      </div>

      <dl className="mt-5 space-y-2 text-xs leading-5 text-muted-foreground">
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
      </dl>
      <AttributeSpecCards cards={booking.attributes} className="mt-4" />

      {booking.listingDescription ? (
        <p className="mt-4 border-t border-border py-4 text-xs leading-5 text-muted-foreground">
          {booking.listingDescription}
        </p>
      ) : (
        <div className="mt-4 border-t border-border" />
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
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-foreground" />
      <dt className="font-semibold text-foreground">{label}:</dt>
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
  disputeUntil,
  cancelOpen,
  setCancelOpen,
  disputeOpen,
  setDisputeOpen,
  showActions,
}: {
  booking: BookingDetailViewModel;
  locale: Locale;
  state: BookingDetailState;
  canPay: boolean;
  canCancel: boolean;
  canDispute: boolean;
  disputeUntil: string | null;
  cancelOpen: boolean;
  setCancelOpen: (open: boolean) => void;
  disputeOpen: boolean;
  setDisputeOpen: (open: boolean) => void;
  showActions: boolean;
}) {
  const { t } = useTranslation(NsI18n.Account);
  const deadlineLabel = disputeUntil ? formatDateTime(disputeUntil, locale, DEFAULT_TZ) : null;

  if (!showActions) return null;

  return (
    <div className="mx-5 flex flex-col gap-4 border-t border-border py-4 sm:mx-6 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-1 text-xs leading-5 text-muted-foreground">
        {state === 'cancelled' ? (
          <>
            <p>· {t('bookings.refundPreview', { percent: booking.refundPercent ?? 0 })}</p>
            <p>· {t('bookings.refundTiming')}</p>
          </>
        ) : state === 'absent' ? (
          <>
            <p>· {t('bookings.noRefund')}</p>
            <p>· {t('bookings.disputeHint')}</p>
          </>
        ) : (
          <CancellationPolicyList booking={booking} locale={locale} />
        )}
        {deadlineLabel ? <p>· {t('bookings.disputeDeadline', { date: deadlineLabel })}</p> : null}
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        {canPay ? (
          <BookingPaymentForm
            buttonProps={{
              className:
                'h-10 rounded-sm bg-primary px-6 text-primary-foreground hover:bg-primary/90',
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
              className="h-10 rounded-sm border-foreground bg-foreground px-6 text-background hover:bg-foreground/90 hover:text-background"
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
          <>
            <Button
              type="button"
              variant="outline"
              className="h-10 rounded-sm border-foreground px-6 text-foreground"
              onClick={() => setDisputeOpen(true)}
            >
              {t('bookings.dispute')}
            </Button>
            <DisputeBookingDialog
              deadlineLabel={deadlineLabel}
              open={disputeOpen}
              onOpenChange={setDisputeOpen}
            />
          </>
        ) : null}
      </div>
    </div>
  );
}
