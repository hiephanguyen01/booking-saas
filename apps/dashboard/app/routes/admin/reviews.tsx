import { adminReviewListResponseSchema } from '@booking/contracts';
import type { Route } from './+types/reviews';
import { ReviewInbox } from '~/features/reviews/components/review-inbox';
import { REVIEW_FILTER_SPEC } from '~/features/reviews/lib/review-filters';
import { requirePlatform } from '~/features/admin/server/admin.server';
import { apiGet } from '~/lib/api.server';
import { readListParams } from '~/lib/pagination';
import { readListFilters } from '~/lib/list-filters';
import { dashboardPaths } from '~/constants/paths';
import { apiPaths } from '~/constants/api-paths';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Giám sát đánh giá · BookingOS Admin' }];
}
export async function loader({ request, url }: Route.LoaderArgs) {
  const { auth } = await requirePlatform(request, 'platform.reviews.read');
  const list = readListParams(url.searchParams);
  const { filters, apiFilters } = readListFilters(url.searchParams, REVIEW_FILTER_SPEC);
  const result = await apiGet(apiPaths.platform.reviews, auth, {
    query: list.toApiQuery(apiFilters),
    schema: adminReviewListResponseSchema,
  });
  return {
    result: result.ok ? result.data : null,
    filters,
    error: result.ok ? null : (result.error ?? 'Không tải được đánh giá.'),
  };
}
export default function AdminReviews({ loaderData }: Route.ComponentProps) {
  return (
    <ReviewInbox
      title="Giám sát đánh giá"
      description="Quan sát chất lượng marketplace trên toàn nền tảng. Nội dung đánh giá là dữ liệu chỉ đọc ở cấp platform."
      result={loaderData.result}
      error={loaderData.error}
      filters={loaderData.filters}
      resetHref={dashboardPaths.admin.reviews}
    />
  );
}
