import { Badge } from '@booking/ui/components/ui/badge';
import { Button } from '@booking/ui/components/ui/button';
import { CalendarDays, MessageSquareText, Star } from 'lucide-react';
import { Form } from 'react-router';
import { useState } from 'react';
import {
  AccountPanel,
  DemoNotice,
  MockDisabledState,
  PageHeading,
  StudioThumbnail,
} from '../../features/account/components/account-primitives';
import {
  accountMocksEnabled,
  mockReviews,
  type MockReview,
} from '../../features/account/server/mock-data.server';
import { NsI18n, useTranslation } from '../../lib/i18n';
import type { Route } from './+types/reviews';

export function loader({ request, params }: Route.LoaderArgs) {
  const locale = params.locale === 'en' ? 'en' : 'vi';
  const enabled = accountMocksEnabled();
  const filter = new URL(request.url).searchParams.get('filter') ?? 'newest';
  const reviews = enabled
    ? mockReviews(locale).filter(
        (review) =>
          filter === 'newest' ||
          (filter === 'reviewed' ? review.status === 'reviewed' : review.status === 'pending'),
      )
    : [];
  return { enabled, filter, reviews };
}

export default function ReviewsPage({ loaderData }: Route.ComponentProps) {
  const { t } = useTranslation(NsI18n.Account);
  if (!loaderData.enabled)
    return (
      <div className="space-y-4">
        <PageHeading title={t('reviews.title')} />
        <MockDisabledState />
      </div>
    );
  const filter = (
    <Form method="get">
      <label className="sr-only" htmlFor="review-filter">
        {t('reviews.quickFilter')}
      </label>
      <select
        id="review-filter"
        name="filter"
        defaultValue={loaderData.filter}
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
        className="h-10 rounded-sm border border-input bg-background px-4 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <option value="newest">{t('reviews.newest')}</option>
        <option value="reviewed">{t('reviews.reviewed')}</option>
        <option value="pending">{t('reviews.pending')}</option>
      </select>
    </Form>
  );
  return (
    <div className="space-y-4">
      <PageHeading title={t('reviews.title')} demo action={filter} />
      <DemoNotice />
      <div className="space-y-4">
        {loaderData.reviews.map((review) => (
          <ReviewCard key={review.id} review={review} />
        ))}
      </div>
    </div>
  );
}

function ReviewCard({ review }: { review: MockReview }) {
  const { t } = useTranslation(NsI18n.Account);
  const [composer, setComposer] = useState(false);
  const [submitted, setSubmitted] = useState<number | null>(null);
  return (
    <AccountPanel className="p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <p className="text-sm font-medium">{review.studio}</p>
        <div className="flex items-center gap-2 text-xs">
          <span>{review.bookingCode}</span>
          {review.status === 'reviewed' ? (
            <>
              <span className="h-4 w-px bg-border" />
              <span className="font-medium text-destructive">{t('reviews.completed')}</span>
            </>
          ) : null}
        </div>
      </div>
      <div className="grid gap-4 py-5 sm:grid-cols-[158px_1fr]">
        <StudioThumbnail label={review.listing} className="h-28 rounded-sm" />
        <div>
          <p className="text-sm font-semibold">{review.listing}</p>
          <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <CalendarDays className="size-4" />
            {review.date}
          </p>
          <Badge variant="secondary" className="mt-3">
            {review.time}
          </Badge>
        </div>
      </div>
      {review.status === 'pending' && submitted === null ? (
        <div className="flex flex-wrap items-center justify-end gap-4 border-t border-border pt-4">
          <span className="text-sm font-medium text-emerald-600">{t('reviews.invitation')}</span>
          <Button variant="outline" onClick={() => setComposer((value) => !value)}>
            {t('reviews.action')}
          </Button>
        </div>
      ) : null}
      {composer && submitted === null ? (
        <div className="mt-4 flex items-center justify-end gap-1 rounded-sm bg-muted/40 p-4">
          <span className="mr-2 text-xs text-muted-foreground">{t('reviews.action')}:</span>
          {[1, 2, 3, 4, 5].map((rating) => (
            <button
              key={rating}
              type="button"
              onClick={() => {
                setSubmitted(rating);
                setComposer(false);
              }}
              className="rounded-sm p-1 text-amber-500 hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`${rating}/5`}
            >
              <Star className="size-5" fill="currentColor" />
            </button>
          ))}
        </div>
      ) : null}
      {review.status === 'reviewed' || submitted !== null ? (
        <div className="border-t border-border pt-5">
          <div className="flex items-center gap-1 text-amber-500">
            {Array.from({ length: submitted ?? review.rating ?? 0 }, (_, index) => (
              <Star key={index} className="size-4" fill="currentColor" />
            ))}
          </div>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            {review.body ?? t('demoDescription')}
          </p>
          {review.response ? (
            <div className="mt-4 rounded-sm bg-muted/60 p-4">
              <p className="flex items-center gap-2 text-xs font-semibold">
                <MessageSquareText className="size-4" />
                {review.studio}
              </p>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">{review.response}</p>
            </div>
          ) : null}
        </div>
      ) : null}
    </AccountPanel>
  );
}
