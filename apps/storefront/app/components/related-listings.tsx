import { cn } from '@booking/ui/lib/utils';
import { SectionCard } from '~/components/section-card';
import type { DiscoveryListingCardData } from '~/features/catalog/lib/listing-card.types';
import { FavoriteDiscoveryListingCard } from '~/features/favorites/components/favorite-cards';

const MAX_RELATED = 4;

/**
 * The "you might also like" rail under a detail page: a snap carousel below `xl`,
 * a four-column grid above it. The listing-group and package pages each had their
 * own copy that differed only in the heading.
 */
export function RelatedListings({
  listings,
  title,
  titleId,
  titleClassName,
  compactMobile = false,
}: {
  listings: DiscoveryListingCardData[];
  title: string;
  titleId: string;
  titleClassName?: string;
  compactMobile?: boolean;
}) {
  if (!listings.length) return null;

  return (
    <SectionCard
      aria-labelledby={titleId}
      className={cn(compactMobile && 'max-md:rounded-none max-md:border-x-0 max-md:shadow-none')}
    >
      <h2 id={titleId} className={cn('text-base font-semibold', titleClassName)}>
        {title}
      </h2>
      <div className="-mx-4 mt-5 flex snap-x snap-mandatory scroll-pl-4 gap-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:scroll-pl-6 sm:px-6 xl:mx-0 xl:grid xl:grid-cols-4 xl:overflow-visible xl:px-0">
        {listings.slice(0, MAX_RELATED).map((item) => (
          <div
            key={item.listing.id}
            className={cn(
              'shrink-0 snap-start xl:w-auto xl:max-w-none',
              compactMobile
                ? 'w-60 max-w-60 md:w-69.5 md:max-w-69.5'
                : 'w-[78vw] max-w-69.5 sm:w-69.5',
            )}
          >
            <FavoriteDiscoveryListingCard item={item} />
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
