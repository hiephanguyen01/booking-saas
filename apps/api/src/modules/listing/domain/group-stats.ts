/**
 * Post (listing_group) aggregates derived from its child listings — the counts
 * and the "from" price the dashboard list and the reviewer see (§7.3).
 *
 * Pure and framework-free: the repository supplies the facts, this decides what
 * they mean. `isReady` deliberately mirrors the reviewer's submission checklist
 * (`review-checklist.ts`: a photo, a description, a price for every enabled
 * mode) so "3/5 ready" on the list and the per-item checklist can never disagree.
 */
import { basePrices, type PricedListingFacts } from '../../../shared/domain/pricing/base-prices';

/**
 * The slice of a child listing these aggregates read: what prices it (shared
 * with catalog and favorites via `PricedListingFacts`) plus the two fields only
 * the reviewer checklist cares about.
 */
export interface ListingStatsFacts extends PricedListingFacts {
  description: string | null;
  photos: readonly string[];
}

export interface ListingGroupStats {
  listingCount: number;
  readyListingCount: number;
  /** Lowest configured base price in VND đồng as a digit string; null if none. */
  priceFrom: string | null;
}

/** A listing that would pass the reviewer's checklist: photo + description + a price per mode. */
export function isListingReady(listing: ListingStatsFacts): boolean {
  return (
    Boolean(listing.description?.trim()) &&
    listing.photos.length > 0 &&
    listing.bookingModes.length > 0 &&
    listing.bookingModes.every((mode) =>
      basePrices({ ...listing, bookingModes: [mode] }).some((price) => price > 0n),
    )
  );
}

export function computeGroupStats(children: readonly ListingStatsFacts[]): ListingGroupStats {
  const prices = children.flatMap(basePrices);
  const min = prices.length > 0 ? prices.reduce((a, b) => (b < a ? b : a)) : null;
  return {
    listingCount: children.length,
    readyListingCount: children.filter(isListingReady).length,
    priceFrom: min === null ? null : min.toString(),
  };
}
