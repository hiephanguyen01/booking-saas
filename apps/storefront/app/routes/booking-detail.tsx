import { RouteErrorState } from '@booking/ui/components/route-error-state';
import {
  useFetcher,
  useNavigation,
  useOutletContext,
  useSearchParams,
} from 'react-router';
import { BookingPaymentView } from '../features/booking/components/booking-payment-view';
import { deriveBookingPaymentState } from '../features/booking/booking-payment-state';
import {
  handleBookingDetailAction,
  loadBookingDetail,
} from '../features/booking/server/booking-detail.server';
import { useAdaptivePaymentPolling } from '../features/booking/use-adaptive-payment-polling';
import { PaymentHandoff } from '../features/checkout/components/payment-handoff';
import { NsI18n, useTranslation } from '../lib/i18n';
import { storefrontPaths } from '../lib/locale-paths';
import { useLocale } from '../lib/use-locale';
import type { StorefrontContext } from '../root';
import type { loader as paymentStatusLoader } from './booking-payment-status';
import type { Route } from './+types/booking-detail';

export function meta() {
  return [{ title: 'Booking' }, { name: 'robots', content: 'noindex' }];
}

export function loader({ request, params }: Route.LoaderArgs) {
  return loadBookingDetail(request, params.code);
}

export function action({ request, params }: Route.ActionArgs) {
  const locale = params.locale === 'en' ? 'en' : 'vi';
  return handleBookingDetailAction(request, params.code, locale);
}

export default function BookingDetail({ loaderData, actionData }: Route.ComponentProps) {
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
  const paymentState = deriveBookingPaymentState(status, searchParams);

  useAdaptivePaymentPolling({
    enabled: paymentState.isPending,
    href: `/${locale}/bookings/${encodeURIComponent(code)}/payment-status`,
    load: paymentFetcher.load,
    state: paymentFetcher.state,
  });

  if (actionData && 'handoff' in actionData && actionData.handoff) {
    return <PaymentHandoff destination={actionData.handoff} />;
  }

  const actionError = actionData && !actionData.ok ? actionData.error : null;

  return (
    <BookingPaymentView
      code={code}
      locale={locale}
      status={status}
      bookingStatus={paymentState.bookingStatus}
      paymentFailed={paymentState.paymentFailed}
      isSuccess={paymentState.isSuccess}
      isPending={paymentState.isPending}
      canRetry={canRetry}
      listingSlug={listingSlug}
      mockEnabled={mockEnabled}
      submitting={navigation.state === 'submitting'}
      signedIn={Boolean(currentUser)}
      actionError={actionError}
    />
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const locale = useLocale();
  const { t } = useTranslation(NsI18n.Navigation);
  return (
    <RouteErrorState
      error={error}
      homeHref={storefrontPaths.bookings(locale)}
      homeLabel={t('lookup')}
    />
  );
}
