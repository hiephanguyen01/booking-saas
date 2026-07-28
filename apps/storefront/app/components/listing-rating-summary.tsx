import { Star } from 'lucide-react';
import { NsI18n, useTranslation } from '@booking/i18n';

export function ListingRatingSummary({
  ratingAvg,
  reviewCount,
}: {
  ratingAvg: number | null;
  reviewCount: number;
}) {
  const { t } = useTranslation(NsI18n.Listing);

  if (ratingAvg === null || reviewCount === 0) {
    return (
      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
        <Star className="size-4" aria-hidden="true" />
        {t('noReviews')}
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center gap-1.5"
      aria-label={`${ratingAvg.toFixed(1)} / 5 · ${t('reviewCount', { count: reviewCount })}`}
    >
      <Star className="size-4 text-amber-400" fill="currentColor" aria-hidden="true" />
      <strong className="font-semibold text-foreground">{ratingAvg.toFixed(1)}</strong>
      <span aria-hidden="true">·</span>
      <span>{t('reviewCount', { count: reviewCount })}</span>
    </span>
  );
}
