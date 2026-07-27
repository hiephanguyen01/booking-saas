import { reviewListResponseSchema } from '@booking/contracts';
import type { Route } from './+types/reviews';
import { ReviewInbox } from '~/features/reviews/components/review-inbox';
import { REVIEW_FILTER_SPEC } from '~/features/reviews/lib/review-filters';
import { requireTenant } from '~/features/tenant/server/tenant.server';
import { apiGet } from '~/lib/api.server';
import { readListParams } from '~/lib/pagination';
import { readListFilters } from '~/lib/list-filters';
import { dashboardPaths } from '~/constants/paths';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Đánh giá · Tenant · BookingOS' }];
}
export async function loader({ request, url }: Route.LoaderArgs) {
  const { auth } = await requireTenant(request, 'tenant.reviews.read');
  const list = readListParams(url.searchParams);
  const { filters, apiFilters } = readListFilters(url.searchParams, REVIEW_FILTER_SPEC);
  const result = await apiGet('/tenant/reviews', auth, {
    query: list.toApiQuery(apiFilters),
    schema: reviewListResponseSchema,
  });
  return {
    result: result.ok ? result.data : null,
    filters,
    error: result.ok ? null : (result.error ?? 'Không tải được đánh giá.'),
  };
}
export default function TenantReviews({ loaderData }: Route.ComponentProps) {
  return (
    <ReviewInbox
      title="Chất lượng đánh giá"
      description="Theo dõi phản hồi khách hàng trên toàn bộ đối tác và dịch vụ trong tenant."
      result={loaderData.result}
      error={loaderData.error}
      filters={loaderData.filters}
      resetHref={dashboardPaths.tenant.reviews}
    />
  );
}
