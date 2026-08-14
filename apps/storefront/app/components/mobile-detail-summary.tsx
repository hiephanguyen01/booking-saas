import { NsI18n, useTranslation } from '@booking/i18n';
import { MapPin } from 'lucide-react';
import type { ReactNode } from 'react';
import { ListingRatingSummary } from '~/components/listing-rating-summary';
import { cn } from '@booking/ui/lib/utils';

export function MobileDetailSummary({
  title,
  location,
  mapsHref,
  ratingAvg,
  reviewCount,
  completedBookings,
  eyebrow,
  variant = 'default',
}: {
  title: string;
  location: string | null;
  mapsHref?: string | null;
  ratingAvg: number | null;
  reviewCount: number;
  completedBookings?: number;
  eyebrow?: ReactNode;
  variant?: 'default' | 'figma';
}) {
  const { t } = useTranslation(NsI18n.Listing);
  const locationRow = location ? (
    <div className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
      <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      <span>{location}</span>
      {mapsHref ? (
        <a
          href={mapsHref}
          target="_blank"
          rel="noreferrer"
          className="ml-auto shrink-0 font-semibold text-primary"
        >
          {t('group.viewMap')}
        </a>
      ) : null}
    </div>
  ) : null;

  return (
    <section className="border-y border-border bg-card px-4 py-4 text-card-foreground">
      {eyebrow ? <div className="mb-1 text-xs text-muted-foreground">{eyebrow}</div> : null}
      <h1
        className={cn(
          'leading-7',
          variant === 'figma' ? 'text-lg font-semibold' : 'text-xl font-bold',
        )}
      >
        {title}
      </h1>
      {variant === 'figma' ? locationRow : null}
      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground">
        <ListingRatingSummary ratingAvg={ratingAvg} reviewCount={reviewCount} />
        {completedBookings ? <span>{t('bookedCount', { count: completedBookings })}</span> : null}
      </div>
      {variant === 'default' ? locationRow : null}
    </section>
  );
}
