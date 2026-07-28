import { Button } from '@booking/ui/components/ui/button';
import { ChevronLeft, ChevronRight, MessageSquareText } from 'lucide-react';
import { Form, Link } from 'react-router';
import { AccountResultsSkeleton } from '~/components/loading-skeletons';
import { NsI18n, useTranslation } from '@booking/i18n';
import { AccountPanel, PageHeading } from '~/features/account/components/shared/account-primitives';
import { ReviewBookingCard } from '~/features/account/components/reviews/review-booking-card';
import { ReviewDialog } from '~/features/account/components/reviews/review-dialog';
import type { AccountReviewFilter } from '~/features/account/lib/review-filter';
import { useAccountReviewsPageController } from '~/features/account/hooks/use-account-reviews-page-controller';
import type { loadAccountReviewsRoute } from '~/features/account/server/reviews-route.server';
import type { ServerDataFrom } from '~/lib/react-router-data';

export function AccountReviewsPage({
  loaderData,
}: {
  loaderData: ServerDataFrom<typeof loadAccountReviewsRoute>;
}) {
  const { t } = useTranslation([NsI18n.Account, NsI18n.Common]);
  const { activeReview, activeStatus, handleReviewOpenChange, pending, setActiveReview } =
    useAccountReviewsPageController({ status: loaderData.status });

  return (
    <div className="space-y-4 py-2 font-studio">
      <PageHeading title={t('reviews.title')} action={<ReviewFilter active={activeStatus} />} />

      {pending ? (
        <AccountResultsSkeleton label={t('common:loading')} />
      ) : loaderData.error ? (
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

      {pending ? null : (
        <ReviewPagination
          page={loaderData.result.page}
          pageSize={loaderData.result.pageSize}
          total={loaderData.result.total}
          status={loaderData.status}
        />
      )}

      <ReviewDialog
        review={activeReview}
        open={activeReview !== null}
        onOpenChange={handleReviewOpenChange}
      />
    </div>
  );
}

function ReviewFilter({ active }: { active: AccountReviewFilter }) {
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
  status: AccountReviewFilter;
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
        <Link to={`?status=${status}&page=${page + 1}`} aria-disabled={page * pageSize >= total}>
          {t('reviews.next')}
          <ChevronRight className="size-4" aria-hidden="true" />
        </Link>
      </Button>
    </nav>
  );
}
