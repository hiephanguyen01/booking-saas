import { storefrontPaths } from '~/constants/paths';
import type { Route } from './+types/listing';
import { redirectLegacy } from './redirect.server';
export function loader({ request, params }: Route.LoaderArgs) {
  return redirectLegacy(request, (locale) => storefrontPaths.listing(locale, params.listingSlug));
}
export default function LegacyListing() {
  return null;
}
