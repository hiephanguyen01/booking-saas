import { favoriteRefsResponseSchema } from '@booking/contracts';
import { requireLocale } from '~/lib/server/i18n.server';
import { documentPathname } from '~/lib/server/data-request.server';
import { EMPTY_FAVORITE_REFS, needsFavoriteRefs } from '~/features/favorites/lib/favorite-refs';
import { apiGet, rethrowApiInfrastructureFailure } from '~/lib/server/api.server';
import { getOptionalAuth } from '~/lib/server/auth.server';
import { apiPaths } from '~/constants/api-paths';

/**
 * The locale layout's data: the narrowed locale, plus the visitor's favourite refs.
 *
 * Refs are fetched only on the discovery surfaces that render heart controls —
 * auth, checkout, booking and most account pages never ask for them.
 */
export async function loadLocaleLayout(request: Request, localeParam: string | undefined) {
  const locale = requireLocale(localeParam);
  const auth = getOptionalAuth();
  let refs = EMPTY_FAVORITE_REFS;

  // Read through `documentPathname`: a client-side navigation to `/vi` requests
  // `/vi.data`, which matches none of the favourite-bearing route shapes. Matching
  // the raw pathname made every revalidation return empty refs, so the hearts the
  // SSR pass had filled in cleared themselves on the next render.
  if (auth && needsFavoriteRefs(documentPathname(new URL(request.url).pathname))) {
    const result = await apiGet(request, apiPaths.customer.favoriteRefs, auth.session.accessToken, {
      schema: favoriteRefsResponseSchema,
    });
    rethrowApiInfrastructureFailure(result);
    if (result.ok && result.data) refs = result.data;
  }

  return { locale, favorites: { isAuthenticated: Boolean(auth), refs } };
}
