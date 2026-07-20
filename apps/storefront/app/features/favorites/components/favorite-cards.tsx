import type { PublicListingResponse } from '@booking/contracts';
import { ListingCard } from '../../catalog/components/listing-card';
import type { ListingCardPresentation } from '../../catalog/components/listing-card.types';
import { SearchResultCard } from '../../catalog/components/search-result-card';
import type { EnrichedSearchListing, StorefrontSearchState } from '../../search/search-state';
import { NsI18n, useTranslation } from '../../../lib/i18n';
import { useFavorite } from '../favorites-context';

/** ListingCard with a wired, persisted favorite heart (home / catalog / related / account). */
export function FavoriteListingCard({
  listing,
  presentation,
  className,
}: {
  listing: PublicListingResponse;
  presentation?: ListingCardPresentation;
  className?: string;
}) {
  const { t } = useTranslation(NsI18n.Account);
  const { selected, toggle } = useFavorite(listing.kind, listing.id);
  return (
    <ListingCard
      listing={listing}
      presentation={presentation}
      className={className}
      favoriteControl={{
        selected,
        label: t(selected ? 'favorites.remove' : 'favorites.add', { title: listing.title }),
        onToggle: toggle,
      }}
    />
  );
}

/** SearchResultCard (filter page row) with a wired favorite heart. */
export function FavoriteSearchResultCard({
  listing,
  state,
}: {
  listing: EnrichedSearchListing;
  state: StorefrontSearchState;
}) {
  const { t } = useTranslation(NsI18n.Account);
  const { selected, toggle } = useFavorite(listing.kind, listing.id);
  return (
    <SearchResultCard
      listing={listing}
      state={state}
      favoriteControl={{
        selected,
        label: t(selected ? 'favorites.remove' : 'favorites.add', { title: listing.title }),
        onToggle: toggle,
      }}
    />
  );
}
