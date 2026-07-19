import type { ReviewListResponse } from '@booking/contracts';
import { MessageSquareText, Star } from 'lucide-react';
import { SectionCard } from './section-card';
import { RatingStars } from './rating-stars';

export function PublicReviewsSection({
  reviews,
  locale,
}: {
  reviews: ReviewListResponse | null;
  locale: 'vi' | 'en';
}) {
  if (!reviews || reviews.total === 0) return null;
  const en = locale === 'en';
  return (
    <SectionCard aria-labelledby="reviews-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="reviews-title" className="text-base font-semibold">
            {en ? 'Guest reviews' : 'Đánh giá từ khách hàng'}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {reviews.summary.ratingAvg?.toFixed(1)} / 5 · {reviews.total}{' '}
            {en ? 'verified stays' : 'lượt trải nghiệm đã xác thực'}
          </p>
        </div>
        <RatingStars rating={reviews.summary.ratingAvg ?? 0} />
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {reviews.items.map((review) => (
          <article key={review.id} className="rounded-lg border border-border/70 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">{review.customerName}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {new Intl.DateTimeFormat(en ? 'en-US' : 'vi-VN', { dateStyle: 'medium' }).format(
                    new Date(review.createdAt),
                  )}
                </p>
              </div>
              <span className="inline-flex items-center gap-1 text-sm font-semibold text-amber-600">
                <Star className="size-4" fill="currentColor" /> {review.rating}
              </span>
            </div>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">{review.content}</p>
            {review.reply ? (
              <div className="mt-4 rounded-md bg-muted/60 p-3">
                <p className="flex items-center gap-2 text-xs font-semibold">
                  <MessageSquareText className="size-4" />
                  {review.reply.partnerName}
                </p>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  {review.reply.content}
                </p>
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </SectionCard>
  );
}
