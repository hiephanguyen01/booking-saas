import { localeParam } from '~/constants/paths';
import { AccountBookingsPage } from '~/features/account/components/bookings/account-bookings-page';
import {
  handleAccountBookingsAction,
  loadAccountBookingsRoute,
} from '~/features/account/server/account-bookings-route.server';
import type { Route } from './+types/bookings';
import { ACCOUNT_MOBILE_CHROME_HANDLE } from '~/features/site-shell/lib/site-header-handle';

export const handle = ACCOUNT_MOBILE_CHROME_HANDLE;

export function loader({ request, params }: Route.LoaderArgs) {
  const locale = localeParam(params.locale);
  return loadAccountBookingsRoute(request, locale);
}

export function action({ request, params }: Route.ActionArgs) {
  const locale = localeParam(params.locale);
  return handleAccountBookingsAction(request, locale);
}

export default function AccountBookingsRoute(props: Route.ComponentProps) {
  return <AccountBookingsPage {...props} />;
}
