import { storefrontPaths } from '~/constants/paths';
import { redirectLegacy } from '~/features/root/server/legacy-redirect.server';
import type { Route } from './+types/bookings';
export function loader({ request }: Route.LoaderArgs) {
  return redirectLegacy(request, storefrontPaths.bookings);
}
export default function LegacyBookings() {
  return null;
}
