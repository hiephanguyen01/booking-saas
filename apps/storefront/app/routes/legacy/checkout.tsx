import type { Route } from './+types/checkout';
import { storefrontPaths } from '~/constants/paths';
import { redirectLegacy } from '~/features/root/server/legacy-redirect.server';
export function loader({ request }: Route.LoaderArgs) {
  return redirectLegacy(
    request,
    (locale) => `${storefrontPaths.checkout(locale)}${new URL(request.url).search}`,
  );
}
export default function LegacyCheckout() {
  return null;
}
