import type { PublicListingResponse } from '@booking/contracts';
import type { ListingCardPresentation } from '~/features/catalog/lib/listing-card.types';

export interface AccountListingItem {
  listing: PublicListingResponse;
  presentation: ListingCardPresentation;
}
