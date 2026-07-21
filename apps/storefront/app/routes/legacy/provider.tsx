import { storefrontPaths } from '../../lib/locale-paths';
import type { Route } from './+types/provider';
import { redirectLegacy } from './redirect.server';

export function loader({ request, params }: Route.LoaderArgs) {
  return redirectLegacy(request, (locale) => storefrontPaths.provider(locale, params.partnerSlug));
}

export default function LegacyProvider() {
  return null;
}
