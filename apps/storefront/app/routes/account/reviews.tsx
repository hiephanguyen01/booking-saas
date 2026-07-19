import {
  createReviewInputSchema,
  customerReviewListResponseSchema,
  reviewResponseSchema,
  type CustomerReviewItem,
} from '@booking/contracts';
import { Badge } from '@booking/ui/components/ui/badge';
import { Button } from '@booking/ui/components/ui/button';
import { Textarea } from '@booking/ui/components/ui/textarea';
import { CalendarDays, MessageSquareText, Star } from 'lucide-react';
import { useState } from 'react';
import { data, Form, Link, useFetcher } from 'react-router';
import { z } from 'zod';
import { AccountPanel, PageHeading } from '../../features/account/components/account-primitives';
import { apiGet, apiPost } from '../../lib/api.server';
import { requireAuth } from '../../lib/auth.server';
import { errorStatus } from '../../lib/http-status';
import { storefrontPaths } from '../../lib/locale-paths';
import type { Route } from './+types/reviews';

const filterSchema = z.enum(['all', 'pending', 'reviewed']).catch('all');

export async function loader({ request, params }: Route.LoaderArgs) {
  const locale = params.locale === 'en' ? 'en' : 'vi';
  const url = new URL(request.url);
  const auth = requireAuth(storefrontPaths.login(locale, `${url.pathname}${url.search}`));
  const status = filterSchema.parse(url.searchParams.get('status') ?? 'all');
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
  const result = await apiGet(request, '/customer/reviews', auth.session.accessToken, {
    query: { status, page, pageSize: 10 },
    schema: customerReviewListResponseSchema,
  });
  return {
    locale,
    status,
    result: result.ok && result.data ? result.data : { items: [], page, pageSize: 10, total: 0 },
    error: result.ok ? null : (result.error ?? 'REVIEWS_UNAVAILABLE'),
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  const locale = params.locale === 'en' ? 'en' : 'vi';
  const auth = requireAuth(storefrontPaths.login(locale, new URL(request.url).pathname));
  const formData = await request.formData();
  const parsed = createReviewInputSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return data(
      { ok: false, error: 'Vui lòng chọn số sao và viết ít nhất 10 ký tự.' },
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
    return data(
      { ok: false, error: result.error ?? result.code ?? 'Không thể gửi đánh giá.' },
      { status: errorStatus(result.status) },
    );
  }
  return data({ ok: true, error: null });
}

export default function ReviewsPage({ loaderData, actionData }: Route.ComponentProps) {
  const en = loaderData.locale === 'en';
  return (
    <div className="space-y-4">
      <PageHeading
        title={en ? 'Your reviews' : 'Đánh giá của bạn'}
        action={<ReviewFilter active={loaderData.status} en={en} />}
      />
      {actionData?.error ? (
        <p className="rounded-sm border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {actionData.error}
        </p>
      ) : actionData?.ok ? (
        <p className="rounded-sm border border-emerald-600/20 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {en ? 'Thanks. Your review is now public.' : 'Cảm ơn bạn. Đánh giá đã được công khai.'}
        </p>
      ) : null}
      {loaderData.error ? (
        <EmptyState
          text={en ? 'Reviews are temporarily unavailable.' : 'Tạm thời không tải được đánh giá.'}
        />
      ) : loaderData.result.items.length === 0 ? (
        <EmptyState
          text={en ? 'No reviews in this category.' : 'Chưa có đánh giá trong mục này.'}
        />
      ) : (
        <div className="space-y-4">
          {loaderData.result.items.map((review) => (
            <ReviewCard
              key={review.status === 'pending' ? review.bookingId : review.id}
              review={review}
              en={en}
            />
          ))}
        </div>
      )}
      <Pagination
        page={loaderData.result.page}
        pageSize={loaderData.result.pageSize}
        total={loaderData.result.total}
        status={loaderData.status}
        en={en}
      />
    </div>
  );
}

function ReviewFilter({ active, en }: { active: string; en: boolean }) {
  return (
    <Form method="get">
      <select
        name="status"
        defaultValue={active}
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
        className="h-10 rounded-sm border border-input bg-background px-4 text-sm"
        aria-label={en ? 'Filter reviews' : 'Lọc đánh giá'}
      >
        <option value="all">{en ? 'All' : 'Tất cả'}</option>
        <option value="pending">{en ? 'Awaiting review' : 'Chờ đánh giá'}</option>
        <option value="reviewed">{en ? 'Reviewed' : 'Đã đánh giá'}</option>
      </select>
    </Form>
  );
}

function ReviewCard({ review, en }: { review: CustomerReviewItem; en: boolean }) {
  const fetcher = useFetcher<typeof action>();
  const submitting = fetcher.state !== 'idle';
  return (
    <AccountPanel className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4 sm:px-6">
        <div>
          <p className="text-sm font-semibold">{review.partnerName}</p>
          <p className="mt-1 text-xs text-muted-foreground">{review.bookingCode}</p>
        </div>
        <Badge variant={review.status === 'pending' ? 'default' : 'secondary'}>
          {review.status === 'pending'
            ? en
              ? 'Awaiting review'
              : 'Chờ đánh giá'
            : en
              ? 'Published'
              : 'Đã đăng'}
        </Badge>
      </div>
      <div className="grid gap-5 p-5 sm:grid-cols-[128px_1fr] sm:p-6">
        {review.listingImageUrl ? (
          <img
            src={review.listingImageUrl}
            alt=""
            className="h-28 w-full rounded-sm object-cover"
          />
        ) : (
          <div className="h-28 rounded-sm bg-muted" />
        )}
        <div>
          <p className="font-semibold">{review.listingTitle}</p>
          <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            <CalendarDays className="size-4" />
            {review.serviceCompletedAt
              ? new Intl.DateTimeFormat(en ? 'en-US' : 'vi-VN', { dateStyle: 'medium' }).format(
                  new Date(review.serviceCompletedAt),
                )
              : en
                ? 'Service completed'
                : 'Dịch vụ đã hoàn tất'}
          </p>
        </div>
      </div>
      {review.status === 'pending' ? (
        <fetcher.Form method="post" className="space-y-4 border-t border-border px-5 py-5 sm:px-6">
          <input type="hidden" name="bookingId" value={review.bookingId} />
          <fieldset>
            <legend className="mb-2 text-sm font-medium">
              {en ? 'Your rating' : 'Mức độ hài lòng'}
            </legend>
            <StarRatingInput id={review.bookingId} en={en} />
          </fieldset>
          <Textarea
            name="content"
            required
            minLength={10}
            maxLength={2000}
            rows={4}
            placeholder={
              en
                ? 'What stood out about your experience?'
                : 'Điều gì khiến trải nghiệm của bạn đáng nhớ?'
            }
          />
          <div className="flex justify-end">
            <Button type="submit" disabled={submitting}>
              {submitting
                ? en
                  ? 'Publishing...'
                  : 'Đang đăng...'
                : en
                  ? 'Publish review'
                  : 'Đăng đánh giá'}
            </Button>
          </div>
          {fetcher.data?.error ? (
            <p className="text-sm text-destructive" role="alert">
              {fetcher.data.error}
            </p>
          ) : null}
        </fetcher.Form>
      ) : (
        <div className="border-t border-border px-5 py-5 sm:px-6">
          <Stars rating={review.rating} />
          <p className="mt-3 text-sm leading-6 text-muted-foreground">{review.content}</p>
          {review.reply ? (
            <div className="mt-4 rounded-sm bg-muted/60 p-4">
              <p className="flex items-center gap-2 text-xs font-semibold">
                <MessageSquareText className="size-4" />
                {review.reply.partnerName}
              </p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{review.reply.content}</p>
            </div>
          ) : null}
        </div>
      )}
    </AccountPanel>
  );
}

function StarRatingInput({ id, en }: { id: string; en: boolean }) {
  const [selected, setSelected] = useState<number | null>(null);
  const [preview, setPreview] = useState<number | null>(null);
  const activeRating = preview ?? selected ?? 0;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div
        className="flex gap-0.5"
        onPointerLeave={() => setPreview(null)}
        aria-label={en ? 'Select a rating from 1 to 5 stars' : 'Chọn mức đánh giá từ 1 đến 5 sao'}
      >
        {[1, 2, 3, 4, 5].map((rating) => (
          <span key={rating}>
            <input
              className="peer sr-only"
              type="radio"
              id={`rating-${id}-${rating}`}
              name="rating"
              value={rating}
              checked={selected === rating}
              onChange={() => setSelected(rating)}
              required
            />
            <label
              className="block cursor-pointer rounded-sm p-1 outline-none transition-transform hover:scale-110 peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2"
              htmlFor={`rating-${id}-${rating}`}
              aria-label={en ? `${rating} out of 5 stars` : `${rating} trên 5 sao`}
              onPointerEnter={() => setPreview(rating)}
              onFocus={() => setPreview(rating)}
              onBlur={() => setPreview(null)}
            >
              <Star
                className={
                  rating <= activeRating
                    ? 'size-7 text-amber-400'
                    : 'size-7 text-muted-foreground/35'
                }
                fill={rating <= activeRating ? 'currentColor' : 'none'}
                aria-hidden="true"
              />
            </label>
          </span>
        ))}
      </div>
      <span className="min-w-9 text-sm font-medium text-muted-foreground" aria-live="polite">
        {selected ? `${selected}/5` : en ? 'Not selected' : 'Chưa chọn'}
      </span>
    </div>
  );
}

function Stars({ rating }: { rating: number }) {
  return (
    <div className="flex gap-1 text-amber-500">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star key={star} className="size-4" fill={star <= rating ? 'currentColor' : 'none'} />
      ))}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <AccountPanel className="flex min-h-64 items-center justify-center p-8 text-center text-sm text-muted-foreground">
      {text}
    </AccountPanel>
  );
}

function Pagination({
  page,
  pageSize,
  total,
  status,
  en,
}: {
  page: number;
  pageSize: number;
  total: number;
  status: string;
  en: boolean;
}) {
  if (total <= pageSize) return null;
  return (
    <div className="flex justify-end gap-2">
      <Button
        asChild
        variant="outline"
        size="sm"
        className={page <= 1 ? 'pointer-events-none opacity-50' : ''}
      >
        <Link to={`?status=${status}&page=${page - 1}`}>{en ? 'Previous' : 'Trước'}</Link>
      </Button>
      <Button
        asChild
        variant="outline"
        size="sm"
        className={page * pageSize >= total ? 'pointer-events-none opacity-50' : ''}
      >
        <Link to={`?status=${status}&page=${page + 1}`}>{en ? 'Next' : 'Sau'}</Link>
      </Button>
    </div>
  );
}
