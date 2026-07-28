import { storefrontPaths } from '~/constants/paths';
import { redirectLegacy } from '~/features/root/server/legacy-redirect.server';
import type { Route } from './+types/provider';

export function loader({ request, params }: Route.LoaderArgs) {
  return redirectLegacy(request, (locale) => storefrontPaths.provider(locale, params.partnerSlug));
}

export default function LegacyProvider() {
  return null;
}
