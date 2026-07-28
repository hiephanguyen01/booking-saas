import type { Route } from './+types/become-partner';
import { storefrontPaths } from '~/lib/locale-paths';
import { redirectLegacy } from './redirect.server';
export function loader({ request }: Route.LoaderArgs) {
  return redirectLegacy(request, storefrontPaths.becomePartner);
}
export default function LegacyBecomePartner() {
  return null;
}
