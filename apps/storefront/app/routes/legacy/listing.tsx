import { storefrontPaths } from '~/constants/paths';
import { redirectLegacy } from '~/features/root/server/legacy-redirect.server';
import type { Route } from './+types/listing';
export function loader({ request, params }: Route.LoaderArgs) {
  return redirectLegacy(request, (locale) => storefrontPaths.listing(locale, params.listingSlug));
}
export default function LegacyListing() {
  return null;
}
