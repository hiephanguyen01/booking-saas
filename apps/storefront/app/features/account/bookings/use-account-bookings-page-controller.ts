import type { CustomerReviewItem } from '@booking/contracts';
import { useState } from 'react';
import { useLocation, useNavigation } from 'react-router';
import { storefrontPaths } from '../../../lib/locale-paths';
import { isReadNavigationMethod, useMinimumPending } from '../../../lib/use-minimum-pending';
import type { Route } from '../../../routes/account/+types/bookings';
import {
  parseBookingHistoryFilter,
  type AccountBookingViewModel,
} from '../lib/booking-history';

type PendingReview = Extract<CustomerReviewItem, { status: 'pending' }>;

export function useAccountBookingsPageController(
  loaderData: Route.ComponentProps['loaderData'],
) {
  const locale = loaderData.locale === 'en' ? 'en' : 'vi';
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
    : loaderData.filter;
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
