import { customerReviewListResponseSchema } from '@booking/contracts';
import type { AccountMenuSummary } from '../account-menu';
import { apiGet } from '../../../lib/api.server';

export async function getAccountMenuSummary(
  request: Request,
  accessToken: string,
): Promise<AccountMenuSummary | null> {
  try {
    const pending = await apiGet(request, '/customer/reviews', accessToken, {
      query: { status: 'pending', page: 1, pageSize: 1 },
      schema: customerReviewListResponseSchema,
    });
    if (!pending.ok || !pending.data) return null;
    return { unreadMessages: 0, pendingReviews: pending.data.total };
  } catch {
    return null;
  }
}
