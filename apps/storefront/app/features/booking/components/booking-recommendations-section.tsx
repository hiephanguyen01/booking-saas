import { NsI18n, useTranslation } from '@booking/i18n';
import { cn } from '@booking/ui/lib/utils';
import { DiscoveryListingTrack } from '~/components/discovery-listing-track';
import type { DiscoveryListingCardData } from '~/features/catalog/lib/listing-card.types';

/** Discovery recommendations shared by the mobile and desktop success views. */
export function BookingRecommendationsSection({
  items,
  headingId,
  className,
}: {
  items: DiscoveryListingCardData[];
  headingId: string;
  className?: string;
}) {
  const { t } = useTranslation([NsI18n.Booking, NsI18n.Common]);
  if (!items.length) return null;

  const title = t('success.recommendations');

  return (
    <section
      className={cn('mt-7 px-4 md:px-0', className)}
      aria-labelledby={headingId}
    >
      <div>
        <p className="text-xs font-semibold tracking-wider text-primary uppercase">
          {t('success.mobileExplore')}
        </p>
        <h2 id={headingId} className="mt-1 text-lg font-bold">
          {title}
        </h2>
      </div>
      <DiscoveryListingTrack
        items={items}
        ariaLabel={title}
        previousLabel={t('common:home.railPrevious')}
        nextLabel={t('common:home.railNext')}
        className="mt-3 md:mt-5"
      />
    </section>
  );
}
