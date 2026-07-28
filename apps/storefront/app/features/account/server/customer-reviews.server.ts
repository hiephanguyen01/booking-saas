import {
  createReviewInputSchema,
  customerReviewListResponseSchema,
  reviewResponseSchema,
  type CustomerReviewItem,
} from '@booking/contracts';
import { data } from 'react-router';
import { apiGet, apiPost } from '~/lib/server/api.server';
import { requireAuth } from '~/lib/server/auth.server';
import { formRequestFailureStatus, readFormRequestBody } from '~/lib/server/form-request.server';
import { errorStatus } from '~/lib/http-status';
import { storefrontPaths } from '~/constants/paths';

const REVIEW_PAGE_SIZE = 100;

export interface ReviewActionData {
  ok: boolean;
  error: string | null;
  bookingId: string | null;
}

export async function loadCustomerReviewsByBooking(
  request: Request,
  accessToken: string,
): Promise<Map<string, CustomerReviewItem>> {
  const reviews = new Map<string, CustomerReviewItem>();
  let page = 1;
  let total = Number.POSITIVE_INFINITY;

  while ((page - 1) * REVIEW_PAGE_SIZE < total) {
    const result = await apiGet(request, '/customer/reviews', accessToken, {
      query: { status: 'all', page, pageSize: REVIEW_PAGE_SIZE },
      schema: customerReviewListResponseSchema,
    });
    if (!result.ok || !result.data) return reviews;

    total = result.data.total;
    for (const review of result.data.items) reviews.set(review.bookingId, review);
    if (result.data.items.length < REVIEW_PAGE_SIZE) break;
    page += 1;
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

  const auth = requireAuth(storefrontPaths.login(locale, new URL(request.url).pathname));
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
    '/customer/reviews',
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
