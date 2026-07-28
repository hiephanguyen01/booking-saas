import type { Route } from './+types/checkout';
import { storefrontPaths } from '~/lib/locale-paths';
import { redirectLegacy } from './redirect.server';
export function loader({ request }: Route.LoaderArgs) {
  return redirectLegacy(
    request,
    (locale) => `${storefrontPaths.checkout(locale)}${new URL(request.url).search}`,
  );
}
export default function LegacyCheckout() {
  return null;
}
