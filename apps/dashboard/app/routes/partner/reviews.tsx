import {
  replyReviewInputSchema,
  reviewListResponseSchema,
  reviewResponseSchema,
} from '@booking/contracts';
import { data } from 'react-router';
import type { Route } from './+types/reviews';
import { ReviewInbox } from '~/features/reviews/components/review-inbox';
import { requirePartner } from '~/features/partner/server/partner.server';
import { apiGet, apiPost } from '~/lib/api.server';
import { readListParams } from '~/lib/pagination';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Đánh giá khách hàng · Partner · Bookify' }];
}

export async function loader({ request, url }: Route.LoaderArgs) {
  const { auth, can } = await requirePartner(request, 'partner.reviews.read');
  const list = readListParams(url.searchParams);
  const result = await apiGet('/partner/reviews', auth, {
    query: list.toApiQuery({
      responseStatus: url.searchParams.get('responseStatus') ?? 'all',
      rating: url.searchParams.get('rating') || undefined,
      q: url.searchParams.get('q') || undefined,
    }),
    schema: reviewListResponseSchema,
  });
  return {
    result: result.ok ? result.data : null,
    canReply: can('partner.reviews.reply'),
    error: result.ok ? null : (result.error ?? 'Không tải được đánh giá.'),
  };
}

export async function action({ request }: Route.ActionArgs) {
  const { auth } = await requirePartner(request, 'partner.reviews.reply');
  const form = await request.formData();
  const reviewId = String(form.get('reviewId') ?? '');
  const parsed = replyReviewInputSchema.safeParse({ content: form.get('content') });
  if (!parsed.success) return data({ error: 'Phản hồi cần ít nhất 10 ký tự.' }, { status: 400 });
  const result = await apiPost(
    `/partner/reviews/${encodeURIComponent(reviewId)}/reply`,
    parsed.data,
    auth,
    { schema: reviewResponseSchema },
  );
  return result.ok
    ? { ok: true }
    : data({ error: result.error ?? 'Không gửi được phản hồi.' }, { status: 400 });
}

export default function PartnerReviews({ loaderData, actionData }: Route.ComponentProps) {
  return (
    <ReviewInbox
      title="Đánh giá khách hàng"
      description="Phản hồi đánh giá đã xác thực để giữ chất lượng dịch vụ và xây dựng niềm tin."
      result={loaderData.result}
      error={loaderData.error}
      actionError={actionData && 'error' in actionData ? actionData.error : null}
      canReply={loaderData.canReply}
    />
  );
}
