import type { CustomerBookingSettlementResponse } from '@booking/contracts';
import type { Locale } from '@booking/i18n';
import { formatDateTime, NsI18n, useTranslation } from '@booking/i18n';
import { Button } from '@booking/ui/components/ui/button';
import { storefrontPaths } from '~/constants/paths';
import { AccountPanel } from '~/features/account/components/shared/account-primitives';
import { BookingPaymentForm } from '~/features/account/components/bookings/booking-payment-form';
import { CancelBookingDialog } from '~/features/account/components/bookings/cancel-booking-dialog';
import { DisputeBookingDialog } from '~/features/account/components/bookings/dispute-booking-dialog';
import { BookingDisputeSection } from './booking-dispute-section';
import { BookingReviewSection } from '~/features/booking/components/booking-detail-sections';
import { MobileBookingDetail } from '~/features/booking/components/mobile-booking-detail';
import {
  bookingDetailState,
  type BookingDetailViewModel,
} from '~/features/booking/lib/booking-detail-model';
import { useBookingDetailOverviewController } from '~/features/account/hooks/use-booking-detail-overview-controller';
import { DEFAULT_TZ } from '~/lib/time';

export function MobileAccountBookingDetail({
  booking,
  locale,
  defaultCancelOpen,
  settlement,
  actionError,
  showReviewSection,
  onReview,
}: {
  booking: BookingDetailViewModel;
  locale: Locale;
  defaultCancelOpen: boolean;
  settlement: CustomerBookingSettlementResponse | null;
  actionError: string | null;
  showReviewSection: boolean;
  onReview: () => void;
}) {
  const state = bookingDetailState(booking.status);
  const controller = useBookingDetailOverviewController({
    booking,
    state,
    defaultCancelOpen,
    settlement,
  });
  const deadlineLabel = controller.disputeUntil
    ? formatDateTime(controller.disputeUntil, locale, DEFAULT_TZ)
    : null;
  const detailPath = storefrontPaths.account.booking(locale, booking.code);

  return (
    <>
      <MobileBookingDetail
        booking={booking}
        locale={locale}
        backHref={storefrontPaths.account.bookings(locale)}
        chatHref={storefrontPaths.account.messages(locale)}
        showHeader={false}
        settlement={settlement}
        actionError={actionError}
        extraSections={
          <>
            {showReviewSection ? (
              <BookingReviewSection booking={booking} onReview={onReview} />
            ) : null}
            {settlement?.dispute ? (
              <BookingDisputeSection dispute={settlement.dispute} locale={locale} />
            ) : null}
            <MobileBookingActions
              canPay={controller.canPay}
              canCancel={controller.canCancel}
              canDispute={controller.canDispute}
              detailPath={detailPath}
              onCancel={() => controller.setCancelOpen(true)}
              onDispute={() => controller.setDisputeOpen(true)}
            />
          </>
        }
      />
      <CancelBookingDialog
        booking={booking}
        locale={locale}
        open={controller.cancelOpen}
        action={detailPath}
        onOpenChange={controller.setCancelOpen}
      />
      <DisputeBookingDialog
        deadlineLabel={deadlineLabel}
        open={controller.disputeOpen}
        action={detailPath}
        onOpenChange={controller.setDisputeOpen}
      />
    </>
  );
}

function MobileBookingActions({
  canPay,
  canCancel,
  canDispute,
  detailPath,
  onCancel,
  onDispute,
}: {
  canPay: boolean;
  canCancel: boolean;
  canDispute: boolean;
  detailPath: string;
  onCancel: () => void;
  onDispute: () => void;
}) {
  const { t } = useTranslation(NsI18n.Account);
  if (!canPay && !canCancel && !canDispute) return null;

  return (
    <div className="flex flex-col gap-2">
      {canPay || canDispute ? (
        <AccountPanel className="flex flex-col gap-2 p-(--sf-surface-pad)">
          {canPay ? (
            <BookingPaymentForm
              action={detailPath}
              buttonProps={{ className: 'min-h-11 w-full text-sm font-semibold' }}
            >
              {t('bookings.payNow')}
            </BookingPaymentForm>
          ) : null}
          {canDispute ? (
            <Button type="button" variant="outline" className="min-h-11 w-full" onClick={onDispute}>
              {t('bookings.dispute')}
            </Button>
          ) : null}
        </AccountPanel>
      ) : null}

      {canCancel ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mx-auto min-h-11 px-5 text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={onCancel}
        >
          {t('bookings.cancel')}
        </Button>
      ) : null}
    </div>
  );
}
