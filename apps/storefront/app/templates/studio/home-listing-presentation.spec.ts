import { describe, expect, it } from 'vitest';
import { HOME_LISTING_FIXTURES } from './home-listing-fixtures';
import { filterHomeListingsByLocation, splitHomeListings } from './home-listing-presentation';

describe('home listing presentation', () => {
  it('caps the lead rail at ten and reuses the catalog for recommendations', () => {
    const sections = splitHomeListings(HOME_LISTING_FIXTURES);

    expect(sections.top).toHaveLength(10);
    expect(sections.recommended).toHaveLength(HOME_LISTING_FIXTURES.length);
  });

  it('preserves the order the API returned rather than inventing a ranking', () => {
    const sections = splitHomeListings(HOME_LISTING_FIXTURES);

    expect(sections.top.map((listing) => listing.id)).toEqual(
      HOME_LISTING_FIXTURES.slice(0, 10).map((listing) => listing.id),
    );
  });

  it('filters recommendations using the Vietnamese administrative address snapshot', () => {
    const hanoi = filterHomeListingsByLocation(HOME_LISTING_FIXTURES, 'hanoi');

    expect(hanoi).not.toHaveLength(0);
    expect(hanoi.every((listing) => listing.provinceName === 'Hà Nội')).toBe(true);
  });
});
