import { useFetcher, useNavigation, useOutletContext, useSearchParams } from 'react-router';
import { useLocale } from '~/hooks/use-locale';
import type { StorefrontContext } from '~/root';
import type { loader as paymentStatusLoader } from '~/routes/booking-payment-status';
import type { Route } from '../../../routes/+types/booking-detail';
import { deriveBookingPaymentState } from '~/features/booking/lib/booking-payment-state';
import { useAdaptivePaymentPolling } from './use-adaptive-payment-polling';

export function useBookingDetailController({
  loaderData,
  actionData,
}: Pick<Route.ComponentProps, 'loaderData' | 'actionData'>) {
  const { code, mockEnabled } = loaderData;
  const { currentUser } = useOutletContext<StorefrontContext>();
  const locale = useLocale();
  const [searchParams] = useSearchParams();
  const paymentFetcher = useFetcher<typeof paymentStatusLoader>();
  const navigation = useNavigation();

  // A full route revalidation after a mutation may be newer than a completed
  // polling response. Compare server timestamps so stale fetcher data cannot
  // overwrite the newer booking snapshot.
  const polled =
    paymentFetcher.data?.ok && paymentFetcher.data.loadedAt > loaderData.loadedAt
      ? paymentFetcher.data
      : null;
  const status = polled?.status ?? loaderData.status;
  const canRetry = polled?.canRetry ?? loaderData.canRetry;
  const listingSlug = polled?.listingSlug ?? loaderData.listingSlug;
  const maskedEmail = polled?.maskedEmail ?? loaderData.maskedEmail;
  const paymentState = deriveBookingPaymentState(status, searchParams);

  useAdaptivePaymentPolling({
    enabled: paymentState.shouldPoll,
    href: `/${locale}/bookings/${encodeURIComponent(code)}/payment-status`,
    load: paymentFetcher.load,
    state: paymentFetcher.state,
  });

  const handoffDestination =
    actionData && 'handoff' in actionData && actionData.handoff ? actionData.handoff : null;
  const rawActionError = actionData && !actionData.ok ? actionData.error : null;
  const actionError =
    rawActionError === 'PAYMENT_METHOD_SELECTION_REQUIRED' ||
    rawActionError === 'PAYMENT_METHOD_UNAVAILABLE'
      ? 'PAYMENT_RETRY_UNAVAILABLE'
      : rawActionError;

  return {
    handoffDestination,
    viewProps: {
      code,
      locale,
      status,
      bookingStatus: paymentState.bookingStatus,
      paymentFailed: paymentState.paymentFailed,
      isSuccess: paymentState.isSuccess,
      isPending: paymentState.isPending,
      canRetry,
      listingSlug,
      maskedEmail,
      mockEnabled,
      submitting: navigation.state === 'submitting',
      signedIn: Boolean(currentUser),
      actionError,
    },
  };
}
