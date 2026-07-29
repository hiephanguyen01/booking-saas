import { customerFavoriteListResponseSchema } from '@booking/contracts';
import { apiGet } from '~/lib/server/api.server';
import { requireCustomerAuth } from '~/lib/server/auth.server';

export async function loadAccountFavoritesRoute(request: Request, locale: 'vi' | 'en') {
  const auth = requireCustomerAuth(request, locale);
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
