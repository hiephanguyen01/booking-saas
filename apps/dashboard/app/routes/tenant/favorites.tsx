import { favoriteListResponseSchema, favoriteSummaryResponseSchema } from '@booking/contracts';
import type { Route } from './+types/favorites';
import { FavoritesInbox } from '~/features/favorites/components/favorites-inbox';
import { requireTenant } from '~/features/tenant/server/tenant.server';
import { apiGet } from '~/lib/api.server';
import { readListParams } from '~/lib/pagination';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Yêu thích · Tenant · Bookify' }];
}

export async function loader({ request, url }: Route.LoaderArgs) {
  const { auth } = await requireTenant(request, 'tenant.favorites.read');
  const list = readListParams(url.searchParams);
  const [result, summary] = await Promise.all([
    apiGet('/tenant/favorites', auth, {
      query: list.toApiQuery({
        target: url.searchParams.get('target') ?? 'all',
        partnerId: url.searchParams.get('partnerId') || undefined,
        q: url.searchParams.get('q') || undefined,
      }),
      schema: favoriteListResponseSchema,
    }),
    apiGet('/tenant/favorites/summary', auth, { schema: favoriteSummaryResponseSchema }),
  ]);
  return {
    result: result.ok ? result.data : null,
    summary: summary.ok ? summary.data : null,
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
    />
  );
}
