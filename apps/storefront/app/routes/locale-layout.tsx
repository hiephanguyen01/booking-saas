import { Outlet, useOutletContext } from 'react-router';
import { FavoritesProvider } from '~/features/favorites/components/favorites-context';
import { loadLocaleLayout } from '~/features/favorites/server/favorite-refs-route.server';
import type { Route } from './+types/locale-layout';
import type { StorefrontContext } from '~/root';

export function loader({ params, request }: Route.LoaderArgs) {
  return loadLocaleLayout(request, params.locale);
}

export default function LocaleLayout({ loaderData }: Route.ComponentProps) {
  const context = useOutletContext<StorefrontContext>();
  return (
    <FavoritesProvider
      isAuthenticated={loaderData.favorites.isAuthenticated}
      refs={loaderData.favorites.refs}
      locale={loaderData.locale}
    >
      <Outlet context={context} />
    </FavoritesProvider>
  );
}
