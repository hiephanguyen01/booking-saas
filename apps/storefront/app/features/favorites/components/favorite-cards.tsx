import type { PublicListingResponse } from '@booking/contracts';
import { NsI18n, useTranslation } from '@booking/i18n';
import { ListingCard } from '~/features/catalog/components/listing-card';
import { SearchResultCard } from '~/features/catalog/components/search-result-card';
import type {
  DiscoveryListingCardData,
  ListingCardDismissControl,
  ListingFavoriteControl,
} from '~/features/catalog/lib/listing-card.types';
import { useFavorite } from '~/features/favorites/hooks/use-favorite';
import type {
  EnrichedSearchListing,
  SearchResultContext,
} from '~/features/search/lib/search-state';

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

/** The shared Figma-aligned card for storefront discovery rails and grids. */
export function FavoriteDiscoveryListingCard({
  item,
  className,
  dismissControl,
}: {
  item: DiscoveryListingCardData;
  className?: string;
  dismissControl?: ListingCardDismissControl;
}) {
  const favoriteControl = useFavoriteControl(item.listing);
  return (
    <ListingCard
      item={item}
      className={className}
      favoriteControl={favoriteControl}
      dismissControl={dismissControl}
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
