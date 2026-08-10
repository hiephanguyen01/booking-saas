import type { CustomerBookingSettlementResponse } from '@booking/contracts';
import type { Locale } from '@booking/i18n';
import { formatDateTime, NsI18n, useTranslation } from '@booking/i18n';
import { Button } from '@booking/ui/components/ui/button';
import { storefrontPaths } from '~/constants/paths';
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
import { MobileStickyActionBar } from '~/features/site-shell/components/mobile-sticky-action-bar';
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
  const { t } = useTranslation(NsI18n.Account);
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

  const actions = (
    <div className="flex w-full gap-2">
      {controller.canPay ? (
        <BookingPaymentForm
          action={detailPath}
          buttonProps={{ className: 'min-h-11 flex-1 text-sm font-semibold' }}
        >
          {t('bookings.payNow')}
        </BookingPaymentForm>
      ) : null}
      {controller.canCancel ? (
        <Button
          type="button"
          variant="destructive"
          className="min-h-11 flex-1"
          onClick={() => controller.setCancelOpen(true)}
        >
          {t('bookings.cancel')}
        </Button>
      ) : null}
      {booking.variant === 'completed' && booking.review?.status === 'pending' ? (
        <Button type="button" className="min-h-11 flex-1" onClick={onReview}>
          {t('bookings.review')}
        </Button>
      ) : null}
      {controller.canDispute ? (
        <Button
          type="button"
          variant="outline"
          className="min-h-11 flex-1"
          onClick={() => controller.setDisputeOpen(true)}
        >
          {t('bookings.dispute')}
        </Button>
      ) : null}
    </div>
  );

  return (
    <>
      <MobileBookingDetail
        booking={booking}
        locale={locale}
        backHref={storefrontPaths.account.bookings(locale)}
        chatHref={storefrontPaths.account.messages(locale)}
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
          </>
        }
        actionBar={
          controller.canPay ||
          controller.canCancel ||
          controller.canDispute ||
          (booking.variant === 'completed' && booking.review?.status === 'pending') ? (
            <MobileStickyActionBar action={actions} />
          ) : undefined
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
