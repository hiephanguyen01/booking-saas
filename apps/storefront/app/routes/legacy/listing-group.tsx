import type { Route } from './+types/listing-group';
import { redirectLegacy } from './redirect.server';
import { storefrontPaths } from '~/lib/locale-paths';

export function loader({ request, params }: Route.LoaderArgs) {
  return redirectLegacy(request, (locale) =>
    storefrontPaths.listingGroup(locale, params.groupSlug),
  );
}
