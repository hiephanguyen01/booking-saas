import { favoriteRefsResponseSchema, type FavoriteRefsResponse } from '@booking/contracts';
import { Outlet, useOutletContext } from 'react-router';
import { FavoritesProvider } from '../features/favorites/favorites-context';
import { apiGet } from '../lib/api.server';
import { getOptionalAuth } from '../lib/auth.server';
import type { Route } from './+types/locale-layout';
import type { StorefrontContext } from '../root';

const EMPTY_REFS: FavoriteRefsResponse = { listingIds: [], groupIds: [] };

export async function loader({ params, request }: Route.LoaderArgs) {
  if (params.locale !== 'vi' && params.locale !== 'en') {
    throw new Response('Locale not found', { status: 404 });
  }
  const locale: 'vi' | 'en' = params.locale;

  // One refs fetch here lights up every heart on every child page (home / filter
  // / detail / account) with no per-card round-trip. Degrade to empty on failure.
  const auth = getOptionalAuth();
  let refs = EMPTY_REFS;
  if (auth) {
    const result = await apiGet(request, '/customer/favorites/refs', auth.session.accessToken, {
      schema: favoriteRefsResponseSchema,
    });
    if (result.ok && result.data) refs = result.data;
  }

  return { locale, favorites: { isAuthenticated: Boolean(auth), refs } };
}

export function shouldRevalidate({
  currentUrl,
  nextUrl,
  formMethod,
  defaultShouldRevalidate,
}: Route.ShouldRevalidateFunctionArgs): boolean {
  const isMutation = Boolean(formMethod && formMethod.toUpperCase() !== 'GET');

  // Manual same-URL polling only needs the booking child loader. Favorite refs
  // still revalidate after add/remove mutations and ordinary navigations.
  if (!isMutation && currentUrl.href === nextUrl.href) return false;
  return defaultShouldRevalidate;
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
