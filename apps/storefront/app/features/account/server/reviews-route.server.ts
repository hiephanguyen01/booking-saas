import { customerReviewListResponseSchema } from '@booking/contracts';
import { apiGet } from '~/lib/api.server';
import { requireAuth } from '~/lib/auth.server';
import { storefrontPaths } from '~/constants/paths';
import { submitCustomerReview } from '~/features/account/server/customer-reviews.server';
import { parseAccountReviewFilter } from '~/features/account/lib/review-filter';

const REVIEW_PAGE_SIZE = 10;

export async function loadAccountReviewsRoute(request: Request, locale: 'vi' | 'en') {
  const url = new URL(request.url);
  const auth = requireAuth(storefrontPaths.login(locale, `${url.pathname}${url.search}`));
  const status = parseAccountReviewFilter(url.searchParams.get('status'));
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
  const result = await apiGet(request, '/customer/reviews', auth.session.accessToken, {
    query: { status, page, pageSize: REVIEW_PAGE_SIZE },
    schema: customerReviewListResponseSchema,
  });

  return {
    locale,
    status,
    result:
      result.ok && result.data
        ? result.data
        : { items: [], page, pageSize: REVIEW_PAGE_SIZE, total: 0 },
    error: result.ok ? null : (result.error ?? 'REVIEWS_UNAVAILABLE'),
  };
}

export function handleAccountReviewsAction(request: Request, locale: 'vi' | 'en') {
  return submitCustomerReview(request, locale);
}
