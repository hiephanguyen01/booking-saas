import { NsI18n, useTranslation } from '@booking/i18n';
import { MapPin } from 'lucide-react';
import type { ReactNode } from 'react';
import { ListingRatingSummary } from '~/components/listing-rating-summary';

export function MobileDetailSummary({
  title,
  location,
  mapsHref,
  ratingAvg,
  reviewCount,
  completedBookings,
  eyebrow,
}: {
  title: string;
  location: string | null;
  mapsHref?: string | null;
  ratingAvg: number | null;
  reviewCount: number;
  completedBookings?: number;
  eyebrow?: ReactNode;
}) {
  const { t } = useTranslation(NsI18n.Listing);

  return (
    <section className="border-y border-border bg-card px-4 py-4 text-card-foreground">
      {eyebrow ? <div className="mb-1 text-xs text-muted-foreground">{eyebrow}</div> : null}
      <h1 className="text-xl leading-7 font-bold">{title}</h1>
      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground">
        <ListingRatingSummary ratingAvg={ratingAvg} reviewCount={reviewCount} />
        {completedBookings ? <span>{t('bookedCount', { count: completedBookings })}</span> : null}
      </div>
      {location ? (
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
      ) : null}
    </section>
  );
}
