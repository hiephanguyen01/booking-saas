import type { PublicListingResponse } from '@booking/contracts';
import { ListingCard } from '~/features/catalog/components/listing-card';
import type { ListingCardPresentation } from '~/features/catalog/lib/listing-card.types';
import { SearchResultCard } from '~/features/catalog/components/search-result-card';
import type {
  EnrichedSearchListing,
  StorefrontSearchState,
} from '~/features/search/lib/search-state';
import { NsI18n, useTranslation } from '@booking/i18n';
import { useFavorite } from '~/features/favorites/hooks/use-favorite';

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
