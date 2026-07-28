import type { CustomerBookingSettlementResponse } from '@booking/contracts';
import type { Locale } from '@booking/i18n';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router';
import { NsI18n, useTranslation } from '~/lib/i18n';
import type { AccountBookingViewModel } from '~/features/account/lib/booking-history';
import { BookingDetailOverview } from './booking-detail-overview';
import { ReviewDialog } from '~/features/account/components/reviews/review-dialog';
import {
  BookingContactSection,
  BookingFinancialSection,
  BookingReviewSection,
  PaymentTaxNote,
} from './booking-detail-sections';
import { useBookingDetailPanelController } from '~/features/account/hooks/use-booking-detail-panel-controller';

export function BookingDetailPanel({
  booking,
  locale,
  defaultCancelOpen,
  actionError,
  settlement,
}: {
  booking: AccountBookingViewModel;
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
    <div className="mx-auto w-full max-w-[870px]">
      <h1 className="mb-3 text-lg font-semibold uppercase leading-7 text-[#1f2937]">
        {t('bookings.title')}
      </h1>
      <div className="flex min-h-13 items-center bg-background px-5 shadow-[0_3px_14px_rgba(15,23,42,0.025)]">
        <Link
          to={bookingsPath}
          className="inline-flex min-h-10 items-center gap-3 text-sm font-medium text-[#263247] transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          {t('bookings.detailTitle')}
        </Link>
      </div>

      {actionError ? (
        <p
          role="alert"
          className="mt-3 border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {t('bookings.actionFailed')}
        </p>
      ) : null}

      <div className="mt-3 space-y-3">
        <BookingDetailOverview
          booking={booking}
          locale={locale}
          state={state}
          defaultCancelOpen={defaultCancelOpen}
        />
        {showReviewSection ? (
          <BookingReviewSection booking={booking} onReview={openPendingReview} />
        ) : null}
        <BookingContactSection booking={booking} />
        <BookingFinancialSection booking={booking} locale={locale} settlement={settlement} />
        <PaymentTaxNote booking={booking} />
      </div>

      <ReviewDialog
        review={activeReview}
        open={reviewDialogOpen}
        action={detailPath}
        onOpenChange={closeReview}
      />
    </div>
  );
}
