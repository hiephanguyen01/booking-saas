import type { Route } from './+types/listing-group';
import { storefrontPaths } from '~/constants/paths';
import { redirectLegacy } from '~/features/root/server/legacy-redirect.server';

export function loader({ request, params }: Route.LoaderArgs) {
  return redirectLegacy(request, (locale) =>
    storefrontPaths.listingGroup(locale, params.groupSlug),
  );
}
