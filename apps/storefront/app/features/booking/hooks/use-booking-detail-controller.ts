import { useFetcher, useNavigation, useOutletContext, useSearchParams } from 'react-router';
import type { BookingPaymentStatusResult } from '~/features/booking/server/booking-payment-status.server';
import type {
  handleBookingDetailAction,
  loadBookingDetail,
} from '~/features/booking/server/booking-detail.server';
import { storefrontPaths } from '~/constants/paths';
import { useLocale } from '~/hooks/use-locale';
import type { ServerDataFrom } from '~/lib/react-router-data';
import type { StorefrontContext } from '~/root';
import { deriveBookingPaymentState } from '~/features/booking/lib/booking-payment-state';
import { useAdaptivePaymentPolling } from './use-adaptive-payment-polling';

export interface BookingDetailControllerProps {
  loaderData: ServerDataFrom<typeof loadBookingDetail>;
  actionData?: ServerDataFrom<typeof handleBookingDetailAction>;
}

export function useBookingDetailController({
  loaderData,
  actionData,
}: BookingDetailControllerProps) {
  const { code, mockEnabled } = loaderData;
  const { currentUser } = useOutletContext<StorefrontContext>();
  const locale = useLocale();
  const [searchParams] = useSearchParams();
  const paymentFetcher = useFetcher<BookingPaymentStatusResult>();
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
  // Polling only refreshes payment state; the booking itself does not change
  // under the customer, so the loader's copy stays authoritative.
  const booking = loaderData.booking;
  const paymentState = deriveBookingPaymentState(status, searchParams);

  useAdaptivePaymentPolling({
    enabled: paymentState.shouldPoll,
    href: storefrontPaths.bookingPaymentStatus(locale, code),
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
      booking,
      mockEnabled,
      submitting: navigation.state === 'submitting',
      signedIn: Boolean(currentUser),
      actionError,
      recommendations: loaderData.recommendations,
      showDetail: searchParams.get('view') === 'detail',
    },
  };
}
