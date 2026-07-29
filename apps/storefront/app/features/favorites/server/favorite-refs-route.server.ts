import { favoriteRefsResponseSchema } from '@booking/contracts';
import { requireLocale } from '~/lib/server/i18n.server';
import { EMPTY_FAVORITE_REFS, needsFavoriteRefs } from '~/features/favorites/lib/favorite-refs';
import { apiGet, rethrowApiInfrastructureFailure } from '~/lib/server/api.server';
import { getOptionalAuth } from '~/lib/server/auth.server';

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

  if (auth && needsFavoriteRefs(new URL(request.url).pathname)) {
    const result = await apiGet(request, '/customer/favorites/refs', auth.session.accessToken, {
      schema: favoriteRefsResponseSchema,
    });
    rethrowApiInfrastructureFailure(result);
    if (result.ok && result.data) refs = result.data;
  }

  return { locale, favorites: { isAuthenticated: Boolean(auth), refs } };
}
