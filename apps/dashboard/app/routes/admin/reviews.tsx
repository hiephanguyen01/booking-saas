import { adminReviewListResponseSchema } from '@booking/contracts';
import type { Route } from './+types/reviews';
import { ReviewInbox } from '~/features/reviews/components/review-inbox';
import { requirePlatform } from '~/features/admin/server/admin.server';
import { apiGet } from '~/lib/api.server';
import { readListParams } from '~/lib/pagination';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Giám sát đánh giá · Bookify Admin' }];
}
export async function loader({ request, url }: Route.LoaderArgs) {
  const { auth } = await requirePlatform(request, 'platform.reviews.read');
  const list = readListParams(url.searchParams);
  const result = await apiGet('/platform/reviews', auth, {
    query: list.toApiQuery({
      responseStatus: url.searchParams.get('responseStatus') ?? 'all',
      rating: url.searchParams.get('rating') || undefined,
      q: url.searchParams.get('q') || undefined,
    }),
    schema: adminReviewListResponseSchema,
  });
  return {
    result: result.ok ? result.data : null,
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
    />
  );
}
