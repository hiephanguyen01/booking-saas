import type { PublicListingResponse } from '@booking/contracts';
import { cn } from '@booking/ui/lib/utils';
import { SectionCard } from '~/components/section-card';
import { FavoriteListingCard } from '~/features/favorites/components/favorite-cards';

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
}: {
  listings: PublicListingResponse[];
  title: string;
  titleId: string;
  titleClassName?: string;
}) {
  if (!listings.length) return null;

  return (
    <SectionCard aria-labelledby={titleId}>
      <h2 id={titleId} className={cn('text-base font-semibold', titleClassName)}>
        {title}
      </h2>
      <div className="-mx-4 mt-5 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6 xl:mx-0 xl:grid xl:grid-cols-4 xl:overflow-visible xl:px-0">
        {listings.slice(0, MAX_RELATED).map((listing) => (
          <div
            key={listing.id}
            className="w-[78vw] max-w-69.5 shrink-0 snap-start sm:w-69.5 xl:w-auto xl:max-w-none"
          >
            <FavoriteListingCard listing={listing} />
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
