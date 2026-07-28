import type { CustomerReviewItem } from '@booking/contracts';
import type { Locale } from '@booking/i18n';
import { useState } from 'react';
import { useLocation, useNavigation } from 'react-router';
import { storefrontPaths } from '~/constants/paths';
import { isReadNavigationMethod, useMinimumPending } from '~/hooks/use-minimum-pending';
import {
  parseBookingHistoryFilter,
  type AccountBookingViewModel,
  type BookingHistoryFilter,
} from '~/features/account/lib/booking-history';

type PendingReview = Extract<CustomerReviewItem, { status: 'pending' }>;

export function useAccountBookingsPageController({
  locale,
  filter,
}: {
  locale: Locale;
  filter: BookingHistoryFilter;
}) {
  const [activeReview, setActiveReview] = useState<PendingReview | null>(null);
  const [activeCancellation, setActiveCancellation] = useState<AccountBookingViewModel | null>(
    null,
  );
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

  return {
    action,
    activeCancellation,
    activeFilter,
    activeReview,
    handleCancellationOpenChange,
    handleReviewOpenChange,
    locale,
    pending,
    setActiveCancellation,
    setActiveReview,
  };
}
