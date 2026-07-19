export type ListingPriceUnit = 'hour' | 'day' | 'item' | 'session';

export interface ListingCardPresentation {
  originalPrice: string | null;
  discountPercent: number | null;
  priceUnit: ListingPriceUnit | null;
}

export interface ListingFavoriteControl {
  selected: boolean;
  label: string;
  onToggle: () => void;
}
