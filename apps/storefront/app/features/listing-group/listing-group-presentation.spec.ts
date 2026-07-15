import { describe, expect, it } from 'vitest';
import {
  filterPresentationReviews,
  listingGroupPresentation,
  paginatePresentationReviews,
  relatedListingPresentation,
} from './listing-group-presentation';

describe('listing group presentation helpers', () => {
  it('returns stable presentation metadata for the same identity', () => {
    const first = listingGroupPresentation('dar-tawhid', ['one.jpg', 'two.jpg'], 'Premium');
    const second = listingGroupPresentation('dar-tawhid', ['one.jpg', 'two.jpg'], 'Premium');
    expect(second).toEqual(first);
  });

  it('builds a valid review distribution', () => {
    const presentation = listingGroupPresentation('studio-a');
    const total = Object.values(presentation.reviewDistribution).reduce(
      (sum, count) => sum + count,
      0,
    );
    expect(total).toBe(presentation.reviewCount);
    expect(Object.values(presentation.reviewDistribution).every((count) => count >= 0)).toBe(true);
  });

  it('filters reviews by rating and paginates without mutating the source', () => {
    const presentation = listingGroupPresentation('studio-b');
    const fiveStar = filterPresentationReviews(presentation.reviews, 5);
    expect(fiveStar.every((review) => review.rating === 5)).toBe(true);
    expect(paginatePresentationReviews(fiveStar, 1)).toEqual(fiveStar.slice(0, 1));
    expect(presentation.reviews).toHaveLength(6);
  });

  it('creates stable related card metadata and derives the original price', () => {
    const metadata = relatedListingPresentation('related-a', '2400000');
    expect(relatedListingPresentation('related-a', '2400000')).toEqual(metadata);
    expect(metadata.originalPrice).not.toBeNull();
    expect(Number(metadata.originalPrice)).toBeGreaterThan(2_400_000);
    expect(metadata.discountPercent).toBeGreaterThan(0);
  });
});
