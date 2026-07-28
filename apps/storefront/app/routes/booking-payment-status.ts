import { loadBookingPaymentStatusRoute } from '~/features/booking/server/booking-payment-status.server';
import type { Route } from './+types/booking-payment-status';

export async function loader({ request, params }: Route.LoaderArgs) {
  return loadBookingPaymentStatusRoute(request, params.code);
}
