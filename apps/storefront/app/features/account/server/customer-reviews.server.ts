import {
  createReviewInputSchema,
  customerReviewListResponseSchema,
  reviewResponseSchema,
  type CustomerReviewItem,
} from '@booking/contracts';
import { data } from 'react-router';
import { apiGet, apiPost } from '~/lib/server/api.server';
import { requireCustomerAuth } from '~/lib/server/auth.server';
import { formRequestFailureStatus, readFormRequestBody } from '~/lib/server/form-request.server';
import { errorStatus } from '~/lib/http-status';
import { mapWithConcurrency } from '~/lib/server/concurrency.server';
import { apiPaths, FETCH_ALL_PAGE_SIZE } from '~/constants/api-paths';

const REVIEW_PAGE_SIZE = FETCH_ALL_PAGE_SIZE;
const REVIEW_PAGE_CONCURRENCY = 4;

export interface ReviewActionData {
  ok: boolean;
  error: string | null;
  bookingId: string | null;
}

/**
 * Every review the customer has written, keyed by booking.
 *
 * Page 1 reports the total, so the remaining pages are known up front and fetch
 * concurrently rather than one round trip at a time — this runs on the bookings
 * list, the booking detail loader and every booking action.
 */
export async function loadCustomerReviewsByBooking(
  request: Request,
  accessToken: string,
): Promise<Map<string, CustomerReviewItem>> {
  const fetchPage = (page: number) =>
    apiGet(request, apiPaths.customer.reviews, accessToken, {
      query: { status: 'all', page, pageSize: REVIEW_PAGE_SIZE },
      schema: customerReviewListResponseSchema,
    });

  const reviews = new Map<string, CustomerReviewItem>();
  const first = await fetchPage(1);
  if (!first.ok || !first.data) return reviews;
  for (const review of first.data.items) reviews.set(review.bookingId, review);

  const pageCount = Math.ceil(first.data.total / REVIEW_PAGE_SIZE);
  const remaining = Array.from({ length: Math.max(0, pageCount - 1) }, (_, index) => index + 2);
  const rest = await mapWithConcurrency(remaining, REVIEW_PAGE_CONCURRENCY, fetchPage);
  for (const result of rest) {
    if (!result.ok || !result.data) continue;
    for (const review of result.data.items) reviews.set(review.bookingId, review);
  }

  return reviews;
}

export async function submitCustomerReview(
  request: Request,
  locale: 'vi' | 'en',
  formData?: FormData,
) {
  const body = formData
    ? ({ ok: true, value: formData } as const)
    : await readFormRequestBody(request);
  if (!body.ok) {
    return data<ReviewActionData>(
      { ok: false, error: body.code, bookingId: null },
      { status: formRequestFailureStatus(body.code) },
    );
  }

  const auth = requireCustomerAuth(request, locale, { includeSearch: false });
  const fields = body.value;
  const bookingId =
    typeof fields.get('bookingId') === 'string' ? String(fields.get('bookingId')) : null;
  const mediaValue = fields.get('media');
  let media: unknown = [];
  try {
    media = typeof mediaValue === 'string' ? JSON.parse(mediaValue) : [];
  } catch {
    media = null;
  }

  const parsed = createReviewInputSchema.safeParse({
    bookingId,
    rating: fields.get('rating'),
    content: fields.get('content'),
    media,
  });
  if (!parsed.success) {
    return data<ReviewActionData>(
      { ok: false, error: 'INVALID_REVIEW', bookingId },
      { status: 400 },
    );
  }

  const result = await apiPost(
    request,
    apiPaths.customer.reviews,
    parsed.data,
    auth.session.accessToken,
    { schema: reviewResponseSchema },
  );
  if (!result.ok) {
    return data<ReviewActionData>(
      { ok: false, error: result.code ?? 'REVIEW_SUBMIT_FAILED', bookingId },
      { status: errorStatus(result.status) },
    );
  }

  return data<ReviewActionData>({ ok: true, error: null, bookingId });
}
