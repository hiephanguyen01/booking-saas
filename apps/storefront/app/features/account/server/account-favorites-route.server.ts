import { customerFavoriteListResponseSchema } from '@booking/contracts';
import { apiGet } from '~/lib/server/api.server';
import { requireCustomerAuth } from '~/lib/server/auth.server';
import { apiPaths, FETCH_ALL_PAGE_SIZE } from '~/constants/api-paths';

export async function loadAccountFavoritesRoute(request: Request, locale: 'vi' | 'en') {
  const auth = requireCustomerAuth(request, locale);
  const result = await apiGet(request, apiPaths.customer.favorites, auth.session.accessToken, {
    query: { pageSize: FETCH_ALL_PAGE_SIZE },
    schema: customerFavoriteListResponseSchema,
  });

  return {
    locale,
    items: result.ok && result.data ? result.data.items : [],
    loadFailed: !result.ok,
  };
}
