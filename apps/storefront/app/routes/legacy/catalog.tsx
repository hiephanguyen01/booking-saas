import { storefrontPaths } from '~/constants/paths';
import { redirectLegacy } from '~/features/root/server/legacy-redirect.server';
import type { Route } from './+types/catalog';
export function loader({ request, params }: Route.LoaderArgs) {
  return redirectLegacy(request, (locale) => storefrontPaths.catalog(locale, params.typeSlug));
}
export default function LegacyCatalog() {
  return null;
}
