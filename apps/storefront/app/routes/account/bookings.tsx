import { AccountBookingsPage } from '~/features/account/bookings/account-bookings-page';
import {
  handleAccountBookingsAction,
  loadAccountBookingsRoute,
} from '~/features/account/bookings/server/account-bookings-route.server';
import type { Route } from './+types/bookings';

export function loader({ request, params }: Route.LoaderArgs) {
  const locale = params.locale === 'en' ? 'en' : 'vi';
  return loadAccountBookingsRoute(request, locale);
}

export function action({ request, params }: Route.ActionArgs) {
  const locale = params.locale === 'en' ? 'en' : 'vi';
  return handleAccountBookingsAction(request, locale);
}

export default function AccountBookingsRoute(props: Route.ComponentProps) {
  return <AccountBookingsPage {...props} />;
}
