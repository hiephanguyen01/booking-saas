import { favoriteListResponseSchema, favoriteSummaryResponseSchema } from '@booking/contracts';
import type { Route } from './+types/favorites';
import { FavoritesInbox } from '~/features/favorites/components/favorites-inbox';
import { FAVORITE_FILTER_SPEC } from '~/features/favorites/lib/favorite-filters';
import { requirePartner } from '~/features/partner/server/partner.server';
import { apiGet } from '~/lib/api.server';
import { readListParams } from '~/lib/pagination';
import { readListFilters } from '~/lib/list-filters';
import { dashboardPaths } from '~/constants/paths';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Yêu thích · Partner · BookingOS' }];
}

export async function loader({ request, url }: Route.LoaderArgs) {
  const { auth } = await requirePartner(request, 'partner.favorites.read');
  const list = readListParams(url.searchParams);
  const { filters, apiFilters } = readListFilters(url.searchParams, FAVORITE_FILTER_SPEC);
  const [result, summary] = await Promise.all([
    apiGet('/partner/favorites', auth, {
      query: list.toApiQuery(apiFilters),
      schema: favoriteListResponseSchema,
    }),
    apiGet('/partner/favorites/summary', auth, { schema: favoriteSummaryResponseSchema }),
  ]);
  return {
    result: result.ok ? result.data : null,
    summary: summary.ok ? summary.data : null,
    filters,
    error: result.ok ? null : (result.error ?? 'Không tải được danh sách yêu thích.'),
  };
}

export default function PartnerFavorites({ loaderData }: Route.ComponentProps) {
  return (
    <FavoritesInbox
      title="Khách yêu thích"
      description="Xem khách hàng nào đã thêm dịch vụ và studio của bạn vào danh sách yêu thích."
      result={loaderData.result}
      summary={loaderData.summary}
      error={loaderData.error}
      filters={loaderData.filters}
      resetHref={dashboardPaths.partner.favorites}
    />
  );
}
