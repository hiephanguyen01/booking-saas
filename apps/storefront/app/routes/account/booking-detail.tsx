import { AccountBookingDetailPage } from '../../features/account/bookings/account-booking-detail-page';
import {
  handleAccountBookingDetailAction,
  loadAccountBookingDetailRoute,
} from '../../features/account/bookings/server/account-booking-detail-route.server';
import type { Route } from './+types/booking-detail';

export function meta() {
  return [{ title: 'Booking history | Bookify' }, { name: 'robots', content: 'noindex' }];
}

export function loader({ request, params }: Route.LoaderArgs) {
  const locale = params.locale === 'en' ? 'en' : 'vi';
  return loadAccountBookingDetailRoute(request, params.code, locale);
}

export function action({ request, params }: Route.ActionArgs) {
  const locale = params.locale === 'en' ? 'en' : 'vi';
  return handleAccountBookingDetailAction(request, params.code, locale);
}

export default function AccountBookingDetailRoute(props: Route.ComponentProps) {
  return <AccountBookingDetailPage {...props} />;
}
