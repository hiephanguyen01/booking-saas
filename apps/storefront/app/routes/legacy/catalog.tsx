import { storefrontPaths } from '~/constants/paths';
import type { Route } from './+types/catalog';
import { redirectLegacy } from './redirect.server';
export function loader({ request, params }: Route.LoaderArgs) {
  return redirectLegacy(request, (locale) => storefrontPaths.catalog(locale, params.typeSlug));
}
export default function LegacyCatalog() {
  return null;
}
