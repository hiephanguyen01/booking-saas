import { storefrontPaths } from '~/constants/paths';
import { redirectLegacy } from '~/features/root/server/legacy-redirect.server';
import type { Route } from './+types/booking-detail';
export function loader({ request, params }: Route.LoaderArgs) {
  return redirectLegacy(
    request,
    (locale) => `${storefrontPaths.booking(locale, params.code)}${new URL(request.url).search}`,
  );
}
export default function LegacyBookingDetail() {
  return null;
}
