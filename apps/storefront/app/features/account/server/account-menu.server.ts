import { customerReviewListResponseSchema } from '@booking/contracts';
import type { AccountMenuSummary } from '../account-menu';
import { apiGet } from '../../../lib/api.server';
import { optionalData } from '../../../lib/optional-data.server';

export async function getAccountMenuSummary(
  request: Request,
  accessToken: string,
): Promise<AccountMenuSummary | null> {
  const pending = await optionalData(
    apiGet(request, '/customer/reviews', accessToken, {
      query: { status: 'pending', page: 1, pageSize: 1 },
      schema: customerReviewListResponseSchema,
    }),
    null,
  );
  if (!pending?.ok || !pending.data) return null;
  return { unreadMessages: 0, pendingReviews: pending.data.total };
}
