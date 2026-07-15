import { describe, expect, it } from 'vitest';
import { HOME_LISTING_FIXTURES } from './home-listing-fixtures';
import {
  createHomeListingViewModels,
  filterHomeListingsByLocation,
  homeListingPresentation,
  splitHomeListings,
} from './home-listing-presentation';

describe('home listing presentation', () => {
  it('creates stable merchandising metadata and a valid original price', () => {
    const listing = HOME_LISTING_FIXTURES[0];
    const first = homeListingPresentation(listing);
    const second = homeListingPresentation(listing);

    expect(second).toEqual(first);
    expect(first.rating).toBeGreaterThanOrEqual(4);
    expect(first.rating).toBeLessThanOrEqual(4.9);
    expect(first.bookingCount).toBeGreaterThanOrEqual(120);
    if (first.discountPercent > 0) {
      expect(Number(first.originalPrice)).toBeGreaterThan(Number(listing.priceFrom));
    }
  });

  it('sorts ten most-booked listings and reuses the catalog for recommendations', () => {
    const sections = splitHomeListings(createHomeListingViewModels(HOME_LISTING_FIXTURES));

    expect(sections.top).toHaveLength(10);
    expect(sections.recommended).toHaveLength(HOME_LISTING_FIXTURES.length);
    expect(sections.top[0].presentation.bookingCount).toBeGreaterThanOrEqual(
      sections.top[9].presentation.bookingCount,
    );
  });

  it('filters recommendations using the Vietnamese administrative address snapshot', () => {
    const viewModels = createHomeListingViewModels(HOME_LISTING_FIXTURES);

    expect(filterHomeListingsByLocation(viewModels, 'hanoi')).not.toHaveLength(0);
    expect(
      filterHomeListingsByLocation(viewModels, 'hanoi').every(
        ({ listing }) => listing.provinceName === 'Hà Nội',
      ),
    ).toBe(true);
  });
});
