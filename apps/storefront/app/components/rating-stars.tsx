import { NsI18n, useTranslation } from '@booking/i18n';
import { cn } from '@booking/ui/lib/utils';
import { Star } from 'lucide-react';

/**
 * One star, the score and the review count in ~70px — what a compact card row
 * has left beside a price. The five-star block below needs 88px on its own, so
 * on a phone the review count wrapped to a second line, and that wrap is what
 * made a rated card stand taller than the unrated one above it.
 */
export function RatingSummary({
  rating,
  count,
  className,
}: {
  rating: number;
  count: number;
  className?: string;
}) {
  const { t } = useTranslation(NsI18n.Listing);

  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1', className)}>
      <Star className="size-3.5 shrink-0 text-warning" fill="currentColor" aria-hidden="true" />
      <span className="font-medium text-foreground">{rating.toFixed(1)}</span>
      <span aria-hidden="true">({count})</span>
      <span className="sr-only">{t('reviewCount', { count })}</span>
    </span>
  );
}

export function RatingStars({ rating, className }: { rating: number; className?: string }) {
  const normalized = Math.min(5, Math.max(0, rating));

  return (
    <span className={cn('inline-flex items-center gap-0.5', className)} aria-label={`${rating}/5`}>
      {[0, 1, 2, 3, 4].map((index) => {
        const fillPercent = Math.min(100, Math.max(0, (normalized - index) * 100));
        return (
          <span key={index} className="relative size-4 shrink-0" aria-hidden="true">
            <Star className="absolute inset-0 size-4 text-warning" />
            {fillPercent > 0 ? (
              <span
                className="absolute inset-0 overflow-hidden"
                style={{ width: `${fillPercent}%` }}
              >
                <Star className="size-4 min-w-4 text-warning" fill="currentColor" />
              </span>
            ) : null}
          </span>
        );
      })}
    </span>
  );
}
