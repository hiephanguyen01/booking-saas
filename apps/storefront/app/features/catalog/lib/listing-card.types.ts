export type ListingPriceUnit = 'hour' | 'day' | 'item' | 'session' | 'package';

export type ListingCardLayout = 'stacked' | 'responsive-row';

export interface ListingCardPresentation {
  originalPrice: string | null;
  discountPercent: number | null;
  priceUnit: ListingPriceUnit | null;
  distanceMeters?: number;
}

export interface ListingFavoriteControl {
  selected: boolean;
  label: string;
  onToggle: () => void;
}

/**
 * Removes the card from the list it is being shown in — not from anything the
 * listing itself owns. Only the account's recently-viewed grid passes one.
 */
export interface ListingCardDismissControl {
  label: string;
  onDismiss: () => void;
}
