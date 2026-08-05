import type { CustomerReviewItem } from '@booking/contracts';
import type { Locale } from '@booking/i18n';
import { useState } from 'react';
import { storefrontPaths } from '~/constants/paths';
import {
  bookingDetailState,
  type BookingDetailViewModel,
} from '~/features/booking/lib/booking-detail-model';

type PendingReview = Extract<CustomerReviewItem, { status: 'pending' }>;

export function useBookingDetailPanelController({
  booking,
  locale,
}: {
  booking: BookingDetailViewModel;
  locale: Locale;
}) {
  const state = bookingDetailState(booking.status);
  const pendingReview: PendingReview | null =
    booking.review?.status === 'pending' ? booking.review : null;
  const [activeReview, setActiveReview] = useState<PendingReview | null>(null);

  return {
    activeReview,
    bookingsPath: storefrontPaths.account.bookings(locale),
    closeReview: (open: boolean) => !open && setActiveReview(null),
    detailPath: storefrontPaths.account.booking(locale, booking.code),
    openPendingReview: () => pendingReview && setActiveReview(pendingReview),
    reviewDialogOpen: activeReview !== null,
    showReviewSection: state === 'done',
    state,
  };
}
