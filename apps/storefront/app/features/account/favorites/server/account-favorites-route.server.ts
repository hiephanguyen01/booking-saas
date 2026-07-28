import { customerFavoriteListResponseSchema } from '@booking/contracts';
import { apiGet } from '~/lib/api.server';
import { requireAuth } from '~/lib/auth.server';
import { storefrontPaths } from '~/lib/locale-paths';

export async function loadAccountFavoritesRoute(request: Request, locale: 'vi' | 'en') {
  const url = new URL(request.url);
  const auth = requireAuth(storefrontPaths.login(locale, `${url.pathname}${url.search}`));
  const result = await apiGet(request, '/customer/favorites', auth.session.accessToken, {
    query: { pageSize: 100 },
    schema: customerFavoriteListResponseSchema,
  });

  return {
    locale,
    items: result.ok && result.data ? result.data.items : [],
    loadFailed: !result.ok,
  };
}
