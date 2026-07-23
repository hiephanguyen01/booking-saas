import { AccountFavoritesPage } from '../../features/account/favorites/account-favorites-page';
import { loadAccountFavoritesRoute } from '../../features/account/favorites/server/account-favorites-route.server';
import type { Route } from './+types/favorites';

export function loader({ request, params }: Route.LoaderArgs) {
  const locale = params.locale === 'en' ? 'en' : 'vi';
  return loadAccountFavoritesRoute(request, locale);
}

export default function AccountFavoritesRoute(props: Route.ComponentProps) {
  return <AccountFavoritesPage {...props} />;
}
