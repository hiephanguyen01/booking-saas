import type { ListingCardPresentation } from '~/features/catalog/components/listing-card.types';
import { loadHomeCatalog } from '~/features/home/server/home-data.server';
import type { AccountListingItem } from '~/features/account/account-listing-item';
import { accountMocksEnabled } from './mock-data.server';

const PRESENTATION_FIXTURES = [
  { discountPercent: 20, priceUnit: 'hour' },
  { discountPercent: null, priceUnit: 'hour' },
  { discountPercent: 20, priceUnit: 'hour' },
  { discountPercent: 20, priceUnit: 'hour' },
  { discountPercent: null, priceUnit: 'hour' },
  { discountPercent: 20, priceUnit: 'hour' },
] satisfies Array<Omit<ListingCardPresentation, 'originalPrice'>>;

export async function loadAccountListingItems(request: Request): Promise<AccountListingItem[]> {
  if (!accountMocksEnabled()) return [];

  try {
    const { listings } = await loadHomeCatalog(request);
    return listings.slice(0, PRESENTATION_FIXTURES.length).map((listing, index) => {
      const fixture = PRESENTATION_FIXTURES[index];
      if (!fixture) throw new Error('Missing account listing presentation fixture');
      return {
        listing,
        presentation: {
          ...fixture,
          originalPrice: originalPrice(listing.priceFrom, fixture.discountPercent),
        },
      };
    });
  } catch {
    return [];
  }
}

function originalPrice(price: string | null, discountPercent: number | null): string | null {
  if (!price || !discountPercent) return null;
  const current = BigInt(price);
  return ((current * 100n) / BigInt(100 - discountPercent)).toString();
}
