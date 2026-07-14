import type { Route } from './+types/listing';
import { storefrontPaths } from '../../lib/locale-paths';
import { redirectLegacy } from './redirect.server';
export function loader({ request, params }: Route.LoaderArgs) { return redirectLegacy(request, (locale) => storefrontPaths.listing(locale, params.listingSlug)); }
export default function LegacyListing() { return null; }
