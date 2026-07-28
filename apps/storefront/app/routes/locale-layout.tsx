import { favoriteRefsResponseSchema } from '@booking/contracts';
import { Outlet, useOutletContext } from 'react-router';
import { FavoritesProvider } from '~/features/favorites/components/favorites-context';
import { EMPTY_FAVORITE_REFS, needsFavoriteRefs } from '~/features/favorites/lib/favorite-refs';
import { apiGet, rethrowApiInfrastructureFailure } from '~/lib/server/api.server';
import { getOptionalAuth } from '~/lib/server/auth.server';
import type { Route } from './+types/locale-layout';
import type { StorefrontContext } from '~/root';

export async function loader({ params, request }: Route.LoaderArgs) {
  if (params.locale !== 'vi' && params.locale !== 'en') {
    throw new Response('Locale not found', { status: 404 });
  }
  const locale: 'vi' | 'en' = params.locale;

  // Favorite refs are needed only on discovery surfaces that render heart
  // controls. Auth, checkout, booking and most account pages skip this request.
  const auth = getOptionalAuth();
  let refs = EMPTY_FAVORITE_REFS;
  if (auth && needsFavoriteRefs(new URL(request.url).pathname)) {
    const result = await apiGet(request, '/customer/favorites/refs', auth.session.accessToken, {
      schema: favoriteRefsResponseSchema,
    });
    rethrowApiInfrastructureFailure(result);
    if (result.ok && result.data) refs = result.data;
  }

  return { locale, favorites: { isAuthenticated: Boolean(auth), refs } };
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
