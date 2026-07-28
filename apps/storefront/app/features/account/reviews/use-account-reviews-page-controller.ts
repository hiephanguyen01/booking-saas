import type { CustomerReviewItem } from '@booking/contracts';
import { useState } from 'react';
import { useLocation, useNavigation } from 'react-router';
import { isReadNavigationMethod, useMinimumPending } from '~/lib/use-minimum-pending';
import { parseAccountReviewFilter, type AccountReviewFilter } from './review-filter';

type PendingReview = Extract<CustomerReviewItem, { status: 'pending' }>;

export function useAccountReviewsPageController({ status }: { status: AccountReviewFilter }) {
  const [activeReview, setActiveReview] = useState<PendingReview | null>(null);
  const location = useLocation();
  const navigation = useNavigation();
  const readNavigationActive =
    navigation.state === 'loading' &&
    navigation.location?.pathname === location.pathname &&
    isReadNavigationMethod(navigation.formMethod);
  const pending = useMinimumPending(readNavigationActive);
  const activeStatus = readNavigationActive
    ? parseAccountReviewFilter(new URLSearchParams(navigation.location?.search).get('status'))
    : status;

  function handleReviewOpenChange(open: boolean) {
    if (!open) {
      setActiveReview(null);
    }
  }

  return {
    activeReview,
    activeStatus,
    handleReviewOpenChange,
    pending,
    setActiveReview,
  };
}
