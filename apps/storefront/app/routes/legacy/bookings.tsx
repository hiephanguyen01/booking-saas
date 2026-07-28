import { storefrontPaths } from '~/lib/locale-paths';
import type { Route } from './+types/bookings';
import { redirectLegacy } from './redirect.server';
export function loader({ request }: Route.LoaderArgs) {
  return redirectLegacy(request, storefrontPaths.bookings);
}
export default function LegacyBookings() {
  return null;
}
