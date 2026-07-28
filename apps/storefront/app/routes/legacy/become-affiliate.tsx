import { storefrontPaths } from '~/constants/paths';
import type { Route } from './+types/become-affiliate';
import { redirectLegacy } from './redirect.server';
export function loader({ request }: Route.LoaderArgs) {
  return redirectLegacy(request, storefrontPaths.becomeAffiliate);
}
export default function LegacyBecomeAffiliate() {
  return null;
}
