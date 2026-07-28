import { StorefrontRouteErrorBoundary } from '~/components/storefront-route-error-boundary';
import { BookingPaymentView } from '~/features/booking/components/booking-payment-view';
import {
  handleBookingDetailAction,
  loadBookingDetail,
} from '~/features/booking/server/booking-detail.server';
import { useBookingDetailController } from '~/features/booking/hooks/use-booking-detail-controller';
import { PaymentHandoff } from '~/features/checkout/components/payment-handoff';
import type { Route } from './+types/booking-detail';

export function meta() {
  return [{ title: 'Booking' }, { name: 'robots', content: 'noindex' }];
}

export function loader({ request, params }: Route.LoaderArgs) {
  const locale = params.locale === 'en' ? 'en' : 'vi';
  return loadBookingDetail(request, params.code, locale);
}

export function action({ request, params }: Route.ActionArgs) {
  const locale = params.locale === 'en' ? 'en' : 'vi';
  return handleBookingDetailAction(request, params.code, locale);
}

export default function BookingDetail({ loaderData, actionData }: Route.ComponentProps) {
  const { handoffDestination, viewProps } = useBookingDetailController({
    loaderData,
    actionData,
  });

  if (handoffDestination) {
    return <PaymentHandoff destination={handoffDestination} />;
  }

  return <BookingPaymentView {...viewProps} />;
}

export function ErrorBoundary({ error, params }: Route.ErrorBoundaryProps) {
  return (
    <StorefrontRouteErrorBoundary error={error} locale={params.locale} destination="bookings" />
  );
}
