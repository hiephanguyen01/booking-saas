import type { PublicListingResponse } from '@booking/contracts';
import { ListingCard } from '~/features/catalog/components/listing-card';
import type {
  ListingCardPresentation,
  ListingFavoriteControl,
} from '~/features/catalog/lib/listing-card.types';
import { SearchResultCard } from '~/features/catalog/components/search-result-card';
import type {
  EnrichedSearchListing,
  SearchResultContext,
} from '~/features/search/lib/search-state';
import { NsI18n, useTranslation } from '@booking/i18n';
import { useFavorite } from '~/features/favorites/hooks/use-favorite';

/** The heart's persisted state and its label — the same wiring for every card shape. */
function useFavoriteControl(listing: {
  kind: PublicListingResponse['kind'];
  id: string;
  title: string;
}): ListingFavoriteControl {
  const { t } = useTranslation(NsI18n.Account);
  const { selected, toggle } = useFavorite(listing.kind, listing.id);
  return {
    selected,
    onToggle: toggle,
    label: t(selected ? 'favorites.remove' : 'favorites.add', { title: listing.title }),
  };
}

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
  const favoriteControl = useFavoriteControl(listing);
  return (
    <ListingCard
      listing={listing}
      presentation={presentation}
      className={className}
      favoriteControl={favoriteControl}
    />
  );
}

/** SearchResultCard (filter page row) with a wired favorite heart. */
export function FavoriteSearchResultCard({
  listing,
  context,
}: {
  listing: EnrichedSearchListing;
  context: SearchResultContext;
}) {
  const favoriteControl = useFavoriteControl(listing);
  return <SearchResultCard listing={listing} context={context} favoriteControl={favoriteControl} />;
}
