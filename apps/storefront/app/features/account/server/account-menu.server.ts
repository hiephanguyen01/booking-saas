import { customerReviewListResponseSchema } from '@booking/contracts';
import type { AccountMenuSummary } from '~/features/account/lib/account-menu';
import { apiGet, rethrowApiInfrastructureFailure } from '~/lib/server/api.server';

export async function getAccountMenuSummary(
  request: Request,
  accessToken: string,
): Promise<AccountMenuSummary | null> {
  const pending = await apiGet(request, '/customer/reviews', accessToken, {
    query: { status: 'pending', page: 1, pageSize: 1 },
    schema: customerReviewListResponseSchema,
  });
  rethrowApiInfrastructureFailure(pending);
  if (!pending.ok || !pending.data) return null;
  return { unreadMessages: 0, pendingReviews: pending.data.total };
}
