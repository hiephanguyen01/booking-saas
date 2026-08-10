import type { CustomerBookingSettlementResponse } from '@booking/contracts';
import type { Locale } from '@booking/i18n';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router';
import { NsI18n, useTranslation } from '@booking/i18n';
import type { BookingDetailViewModel } from '~/features/booking/lib/booking-detail-model';
import { AccountPanel } from '~/features/account/components/shared/account-primitives';
import { bookingActionErrorKey } from '~/features/account/lib/booking-dispute';
import { BookingDetailOverview } from './booking-detail-overview';
import { BookingDisputeSection } from './booking-dispute-section';
import { ReviewDialog } from '~/features/account/components/reviews/review-dialog';
import {
  BookingContactSection,
  BookingFinancialSection,
  BookingReviewSection,
  PaymentTaxNote,
} from '~/features/booking/components/booking-detail-sections';
import { useBookingDetailPanelController } from '~/features/account/hooks/use-booking-detail-panel-controller';
import { MobileAccountBookingDetail } from './mobile-account-booking-detail';

export function BookingDetailPanel({
  booking,
  locale,
  defaultCancelOpen,
  actionError,
  settlement,
}: {
  booking: BookingDetailViewModel;
  locale: Locale;
  defaultCancelOpen: boolean;
  actionError: string | null;
  settlement: CustomerBookingSettlementResponse | null;
}) {
  const { t } = useTranslation(NsI18n.Account);
  const {
    activeReview,
    bookingsPath,
    closeReview,
    detailPath,
    openPendingReview,
    reviewDialogOpen,
    showReviewSection,
    state,
  } = useBookingDetailPanelController({ booking, locale });

  return (
    <>
      <div className="-mx-4 -mt-4 sm:-mx-6 md:hidden">
        <MobileAccountBookingDetail
          booking={booking}
          locale={locale}
          defaultCancelOpen={defaultCancelOpen}
          settlement={settlement}
          actionError={actionError ? t(bookingActionErrorKey(actionError)) : null}
          showReviewSection={showReviewSection}
          onReview={openPendingReview}
        />
      </div>

      <div className="mx-auto hidden w-full max-w-[870px] md:block">
        <h1 className="mb-3 text-lg font-semibold uppercase leading-7 text-foreground">
          {t('bookings.title')}
        </h1>
        <AccountPanel className="flex min-h-13 items-center px-5">
          <Link
            to={bookingsPath}
            className="inline-flex min-h-10 items-center gap-3 text-sm font-medium text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            {t('bookings.detailTitle')}
          </Link>
        </AccountPanel>

        {actionError ? (
          <p
            role="alert"
            className="mt-3 rounded-(--sf-surface-radius) border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            {t(bookingActionErrorKey(actionError))}
          </p>
        ) : null}

        <div className="mt-3 space-y-3">
          <BookingDetailOverview
            booking={booking}
            locale={locale}
            state={state}
            defaultCancelOpen={defaultCancelOpen}
            settlement={settlement}
          />
          {showReviewSection ? (
            <BookingReviewSection booking={booking} onReview={openPendingReview} />
          ) : null}
          <BookingContactSection booking={booking} />
          <BookingFinancialSection booking={booking} locale={locale} settlement={settlement} />
          {settlement?.dispute ? (
            <BookingDisputeSection dispute={settlement.dispute} locale={locale} />
          ) : null}
          <PaymentTaxNote booking={booking} />
        </div>
      </div>

      <ReviewDialog
        review={activeReview}
        open={reviewDialogOpen}
        action={detailPath}
        onOpenChange={closeReview}
      />
    </>
  );
}
