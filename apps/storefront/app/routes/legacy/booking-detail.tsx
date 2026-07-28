import { storefrontPaths } from '~/lib/locale-paths';
import type { Route } from './+types/booking-detail';
import { redirectLegacy } from './redirect.server';
export function loader({ request, params }: Route.LoaderArgs) {
  return redirectLegacy(
    request,
    (locale) => `${storefrontPaths.booking(locale, params.code)}${new URL(request.url).search}`,
  );
}
export default function LegacyBookingDetail() {
  return null;
}
