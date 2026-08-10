import type { CustomerReviewItem } from '@booking/contracts';
import type { Locale } from '@booking/i18n';
import { useState } from 'react';
import { useLocation, useNavigation } from 'react-router';
import { storefrontPaths } from '~/constants/paths';
import { isReadNavigationMethod, useMinimumPending } from '~/hooks/use-minimum-pending';
import type { BookingDetailViewModel } from '~/features/booking/lib/booking-detail-model';
import {
  bookingMatchesSearch,
  parseBookingHistoryFilter,
  type BookingHistoryFilter,
} from '~/features/account/lib/booking-history';

type PendingReview = Extract<CustomerReviewItem, { status: 'pending' }>;

export function useAccountBookingsPageController({
  locale,
  filter,
  bookings,
}: {
  locale: Locale;
  filter: BookingHistoryFilter;
  bookings: BookingDetailViewModel[];
}) {
  const [activeReview, setActiveReview] = useState<PendingReview | null>(null);
  const [activeCancellation, setActiveCancellation] = useState<BookingDetailViewModel | null>(null);
  const [activeDispute, setActiveDispute] = useState<BookingDetailViewModel | null>(null);
  const [query, setQuery] = useState('');
  const location = useLocation();
  const navigation = useNavigation();
  const readNavigationActive =
    navigation.state === 'loading' &&
    navigation.location?.pathname === location.pathname &&
    isReadNavigationMethod(navigation.formMethod);
  const pending = useMinimumPending(readNavigationActive);
  const activeFilter = readNavigationActive
    ? parseBookingHistoryFilter(new URLSearchParams(navigation.location?.search).get('status'))
    : filter;
  const action = storefrontPaths.account.bookings(locale);

  function handleReviewOpenChange(open: boolean) {
    if (!open) {
      setActiveReview(null);
    }
  }

  function handleCancellationOpenChange(open: boolean) {
    if (!open) {
      setActiveCancellation(null);
    }
  }

  function handleDisputeOpenChange(open: boolean) {
    if (!open) {
      setActiveDispute(null);
    }
  }

  return {
    action,
    activeCancellation,
    activeDispute,
    activeFilter,
    activeReview,
    // The dispute intent is owned by the booking detail route's action, so the
    // list posts there rather than growing a second copy of the handler.
    disputeAction: activeDispute
      ? storefrontPaths.account.booking(locale, activeDispute.code)
      : undefined,
    handleCancellationOpenChange,
    handleDisputeOpenChange,
    handleReviewOpenChange,
    locale,
    pending,
    query,
    setQuery,
    setActiveCancellation,
    setActiveDispute,
    setActiveReview,
    visibleBookings: bookings.filter((booking) => bookingMatchesSearch(booking, query)),
  };
}
