import { localeParam } from '~/constants/paths';
import { AccountFavoritesPage } from '~/features/account/components/favorites/account-favorites-page';
import { loadAccountFavoritesRoute } from '~/features/account/server/account-favorites-route.server';
import type { Route } from './+types/favorites';

export function loader({ request, params }: Route.LoaderArgs) {
  const locale = localeParam(params.locale);
  return loadAccountFavoritesRoute(request, locale);
}

export default function AccountFavoritesRoute(props: Route.ComponentProps) {
  return <AccountFavoritesPage {...props} />;
}
