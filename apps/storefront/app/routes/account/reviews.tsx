import {
  customerReviewListResponseSchema,
  type CustomerReviewItem,
} from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import { ChevronLeft, ChevronRight, MessageSquareText } from 'lucide-react';
import { useState } from 'react';
import { Form, Link } from 'react-router';
import { z } from 'zod';
import { AccountPanel, PageHeading } from '../../features/account/components/account-primitives';
import { ReviewBookingCard } from '../../features/account/components/review-booking-card';
import { ReviewDialog } from '../../features/account/components/review-dialog';
import { submitCustomerReview } from '../../features/account/server/customer-reviews.server';
import { apiGet } from '../../lib/api.server';
import { requireAuth } from '../../lib/auth.server';
import { NsI18n, useTranslation } from '../../lib/i18n';
import { storefrontPaths } from '../../lib/locale-paths';
import type { Route } from './+types/reviews';

const filterSchema = z.enum(['all', 'pending', 'reviewed']).catch('all');
type PendingReview = Extract<CustomerReviewItem, { status: 'pending' }>;

export async function loader({ request, params }: Route.LoaderArgs) {
  const locale: 'vi' | 'en' = params.locale === 'en' ? 'en' : 'vi';
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
  return submitCustomerReview(request, locale);
}

export default function ReviewsPage({ loaderData }: Route.ComponentProps) {
  const { t } = useTranslation(NsI18n.Account);
  const [activeReview, setActiveReview] = useState<PendingReview | null>(null);

  return (
    <div className="space-y-4 py-2 font-studio">
      <PageHeading
        title={t('reviews.title')}
        action={<ReviewFilter active={loaderData.status} />}
      />

      {loaderData.error ? (
        <ReviewEmptyState text={t('reviews.unavailable')} />
      ) : loaderData.result.items.length === 0 ? (
        <ReviewEmptyState text={t('reviews.empty')} />
      ) : (
        <div className="space-y-4">
          {loaderData.result.items.map((review) => (
            <ReviewBookingCard
              key={review.status === 'pending' ? review.bookingId : review.id}
              review={review}
              locale={loaderData.locale}
              onReview={setActiveReview}
            />
          ))}
        </div>
      )}

      <ReviewPagination
        page={loaderData.result.page}
        pageSize={loaderData.result.pageSize}
        total={loaderData.result.total}
        status={loaderData.status}
      />

      <ReviewDialog
        review={activeReview}
        open={activeReview !== null}
        onOpenChange={(open) => !open && setActiveReview(null)}
      />
    </div>
  );
}

function ReviewFilter({ active }: { active: 'all' | 'pending' | 'reviewed' }) {
  const { t } = useTranslation(NsI18n.Account);
  return (
    <Form method="get">
      <select
        name="status"
        value={active}
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
        className="h-10 min-w-42 rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={t('reviews.filterLabel')}
      >
        <option value="all">{t('reviews.newest')}</option>
        <option value="reviewed">{t('reviews.reviewed')}</option>
        <option value="pending">{t('reviews.pending')}</option>
      </select>
    </Form>
  );
}

function ReviewEmptyState({ text }: { text: string }) {
  return (
    <AccountPanel className="flex min-h-72 flex-col items-center justify-center gap-3 p-8 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-primary/10 text-primary">
        <MessageSquareText className="size-6" aria-hidden="true" />
      </span>
      <p className="text-sm text-muted-foreground">{text}</p>
    </AccountPanel>
  );
}

function ReviewPagination({
  page,
  pageSize,
  total,
  status,
}: {
  page: number;
  pageSize: number;
  total: number;
  status: string;
}) {
  const { t } = useTranslation(NsI18n.Account);
  if (total <= pageSize) return null;
  return (
    <nav className="flex justify-end gap-2" aria-label={t('reviews.title')}>
      <Button
        asChild
        variant="outline"
        size="sm"
        className={page <= 1 ? 'pointer-events-none opacity-50' : ''}
      >
        <Link to={`?status=${status}&page=${page - 1}`} aria-disabled={page <= 1}>
          <ChevronLeft className="size-4" aria-hidden="true" />
          {t('reviews.previous')}
        </Link>
      </Button>
      <Button
        asChild
        variant="outline"
        size="sm"
        className={page * pageSize >= total ? 'pointer-events-none opacity-50' : ''}
      >
        <Link
          to={`?status=${status}&page=${page + 1}`}
          aria-disabled={page * pageSize >= total}
        >
          {t('reviews.next')}
          <ChevronRight className="size-4" aria-hidden="true" />
        </Link>
      </Button>
    </nav>
  );
}
