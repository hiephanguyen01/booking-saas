import { reviewListResponseSchema } from '@booking/contracts';
import type { Route } from './+types/reviews';
import { ReviewInbox } from '~/features/reviews/components/review-inbox';
import { requireTenant } from '~/features/tenant/server/tenant.server';
import { apiGet } from '~/lib/api.server';
import { readListParams } from '~/lib/pagination';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Đánh giá · Tenant · Bookify' }];
}
export async function loader({ request, url }: Route.LoaderArgs) {
  const { auth } = await requireTenant(request, 'tenant.reviews.read');
  const list = readListParams(url.searchParams);
  const result = await apiGet('/tenant/reviews', auth, {
    query: list.toApiQuery({
      responseStatus: url.searchParams.get('responseStatus') ?? 'all',
      rating: url.searchParams.get('rating') || undefined,
      q: url.searchParams.get('q') || undefined,
    }),
    schema: reviewListResponseSchema,
  });
  return {
    result: result.ok ? result.data : null,
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
    />
  );
}
