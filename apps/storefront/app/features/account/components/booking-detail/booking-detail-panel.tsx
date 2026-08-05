import type { CustomerBookingSettlementResponse } from '@booking/contracts';
import type { Locale } from '@booking/i18n';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router';
import { NsI18n, useTranslation } from '@booking/i18n';
import type { BookingDetailViewModel } from '~/features/booking/lib/booking-detail-model';
import { AccountPanel } from '~/features/account/components/shared/account-primitives';
import { BookingDetailOverview } from './booking-detail-overview';
import { ReviewDialog } from '~/features/account/components/reviews/review-dialog';
import {
  BookingContactSection,
  BookingFinancialSection,
  BookingReviewSection,
  PaymentTaxNote,
} from '~/features/booking/components/booking-detail-sections';
import { useBookingDetailPanelController } from '~/features/account/hooks/use-booking-detail-panel-controller';

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
    <div className="mx-auto w-full max-w-[870px]">
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
