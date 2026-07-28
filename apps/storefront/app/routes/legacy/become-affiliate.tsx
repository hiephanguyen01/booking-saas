import { storefrontPaths } from '~/constants/paths';
import { redirectLegacy } from '~/features/root/server/legacy-redirect.server';
import type { Route } from './+types/become-affiliate';
export function loader({ request }: Route.LoaderArgs) {
  return redirectLegacy(request, storefrontPaths.becomeAffiliate);
}
export default function LegacyBecomeAffiliate() {
  return null;
}
