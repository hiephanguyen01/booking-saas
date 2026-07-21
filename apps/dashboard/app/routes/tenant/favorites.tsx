import { favoriteListResponseSchema, favoriteSummaryResponseSchema } from '@booking/contracts';
import type { Route } from './+types/favorites';
import { FavoritesInbox } from '~/features/favorites/components/favorites-inbox';
import { FAVORITE_FILTER_SPEC } from '~/features/favorites/lib/favorite-filters';
import { requireTenant } from '~/features/tenant/server/tenant.server';
import { apiGet } from '~/lib/api.server';
import { readListParams } from '~/lib/pagination';
import { readListFilters } from '~/lib/list-filters';
import { dashboardPaths } from '~/constants/paths';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Yêu thích · Tenant · Bookify' }];
}

export async function loader({ request, url }: Route.LoaderArgs) {
  const { auth } = await requireTenant(request, 'tenant.favorites.read');
  const list = readListParams(url.searchParams);
  const { filters, apiFilters } = readListFilters(url.searchParams, FAVORITE_FILTER_SPEC);
  const partnerId = url.searchParams.get('partnerId') || undefined;
  const [result, summary] = await Promise.all([
    apiGet('/tenant/favorites', auth, {
      query: list.toApiQuery({ ...apiFilters, partnerId }),
      schema: favoriteListResponseSchema,
    }),
    apiGet('/tenant/favorites/summary', auth, { schema: favoriteSummaryResponseSchema }),
  ]);
  return {
    result: result.ok ? result.data : null,
    summary: summary.ok ? summary.data : null,
    filters,
    error: result.ok ? null : (result.error ?? 'Không tải được danh sách yêu thích.'),
  };
}

export default function TenantFavorites({ loaderData }: Route.ComponentProps) {
  return (
    <FavoritesInbox
      title="Khách yêu thích"
      description="Theo dõi lượt yêu thích trên toàn bộ đối tác và dịch vụ trong tenant."
      result={loaderData.result}
      summary={loaderData.summary}
      error={loaderData.error}
      filters={loaderData.filters}
      resetHref={dashboardPaths.tenant.favorites}
    />
  );
}
