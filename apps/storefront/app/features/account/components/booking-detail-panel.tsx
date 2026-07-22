import type { CustomerBookingSettlementResponse, CustomerReviewItem } from '@booking/contracts';
import type { Locale } from '@booking/i18n';
import { ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { NsI18n, useTranslation } from '../../../lib/i18n';
import { storefrontPaths } from '../../../lib/locale-paths';
import { bookingDetailState, type AccountBookingViewModel } from '../lib/booking-history';
import { BookingDetailOverview } from './booking-detail-overview';
import { ReviewDialog } from './review-dialog';
import {
  BookingContactSection,
  BookingFinancialSection,
  BookingReviewSection,
  PaymentTaxNote,
} from './booking-detail-sections';

type PendingReview = Extract<CustomerReviewItem, { status: 'pending' }>;

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
  const state = bookingDetailState(booking.status);
  const pendingReview: PendingReview | null =
    booking.review?.status === 'pending' ? booking.review : null;
  const [activeReview, setActiveReview] = useState<PendingReview | null>(null);
  const detailPath = storefrontPaths.account.booking(locale, booking.code);

  return (
    <div className="mx-auto w-full max-w-[870px]">
      <h1 className="mb-3 text-lg font-semibold uppercase leading-7 text-[#1f2937]">
        {t('bookings.title')}
      </h1>
      <div className="flex min-h-13 items-center bg-background px-5 shadow-[0_3px_14px_rgba(15,23,42,0.025)]">
        <Link
          to={storefrontPaths.account.bookings(locale)}
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
        {state === 'done' ? (
          <BookingReviewSection
            booking={booking}
            onReview={() => pendingReview && setActiveReview(pendingReview)}
          />
        ) : null}
        <BookingContactSection booking={booking} />
        <BookingFinancialSection booking={booking} locale={locale} settlement={settlement} />
        <PaymentTaxNote booking={booking} />
      </div>

      <ReviewDialog
        review={activeReview}
        open={activeReview !== null}
        action={detailPath}
        onOpenChange={(open) => !open && setActiveReview(null)}
      />
    </div>
  );
}
