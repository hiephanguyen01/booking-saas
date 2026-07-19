import type { PublicListingResponse } from '@booking/contracts';
import type { ListingCardPresentation } from '../catalog/components/listing-card.types';

export interface AccountListingItem {
  listing: PublicListingResponse;
  presentation: ListingCardPresentation;
}
