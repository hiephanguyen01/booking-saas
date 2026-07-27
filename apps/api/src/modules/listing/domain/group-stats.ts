/**
 * Post (listing_group) aggregates derived from its child listings — the counts
 * and the "from" price the dashboard list and the reviewer see (§7.3).
 *
 * Pure and framework-free: the repository supplies the facts, this decides what
 * they mean. `isReady` deliberately mirrors the reviewer's submission checklist
 * (`review-checklist.ts`: a photo, a description, a price for every enabled
 * mode) so "3/5 ready" on the list and the per-item checklist can never disagree.
 */
import { toVnd } from '../../../shared/money/money';

/** The slice of a child listing these aggregates read. */
export interface ListingStatsFacts {
  description: string | null;
  photos: readonly string[];
  bookingModes: readonly string[];
  bookingSelection: 'flexible_duration' | 'fixed_packages';
  modeConfig: Record<string, unknown>;
}

export interface ListingGroupStats {
  listingCount: number;
  readyListingCount: number;
  /** Lowest configured base price in VND đồng as a digit string; null if none. */
  priceFrom: string | null;
}

/**
 * Every configured base price on a listing, as bigint VND đồng. A malformed value
 * is skipped rather than silently becoming `NaN`/`0` and inventing a price.
 */
export function basePrices(listing: ListingStatsFacts): bigint[] {
  const prices: bigint[] = [];
  for (const mode of listing.bookingModes) {
    const value = listing.modeConfig[mode];
    if (!value || typeof value !== 'object') continue;
    const config = value as Record<string, unknown>;
    if (listing.bookingSelection === 'fixed_packages') {
      const packages = Array.isArray(config.packages) ? config.packages : [];
      for (const item of packages) {
        if (!item || typeof item !== 'object') continue;
        const row = item as Record<string, unknown>;
        if (row.isActive !== true) continue;
        const price = toVnd(row.price);
        if (price !== null && price > 0n) prices.push(price);
      }
      continue;
    }
    for (const key of ['basePrice', 'basePricePerNight']) {
      const price = toVnd(config[key]);
      if (price !== null && price > 0n) prices.push(price);
    }
  }
  return prices;
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
