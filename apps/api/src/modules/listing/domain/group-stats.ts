/**
 * Post (listing_group) aggregates derived from its child listings — the counts
 * and the "from" price the dashboard list and the reviewer see (§7.3).
 *
 * Pure and framework-free: the repository supplies the facts, this decides what
 * they mean. `isReady` deliberately mirrors the reviewer's submission checklist
 * (`review-checklist.ts`: a photo, a description, a price for every enabled
 * mode) so "3/5 ready" on the list and the per-item checklist can never disagree.
 */

/** The slice of a child listing these aggregates read. */
export interface ListingStatsFacts {
  description: string | null;
  photos: readonly string[];
  bookingModes: readonly string[];
  modeConfig: Record<string, unknown>;
}

export interface ListingGroupStats {
  listingCount: number;
  readyListingCount: number;
  /** Lowest configured base price in VND đồng as a digit string; null if none. */
  priceFrom: string | null;
}

/**
 * One `mode_config` price → bigint VND đồng, or null if it isn't a usable amount.
 *
 * The canonical wire form is a digit STRING (§7.3 — money never travels as a JS
 * number), parsed with `BigInt`, never `Number()`: `Number()` on a big VND string
 * silently loses precision past 2^53. A number IS still accepted because
 * `prisma/seed.ts` writes `basePrice: 300_000` straight to the jsonb column,
 * bypassing the contract — so real rows hold both shapes and a string-only parser
 * would blank out every seeded listing's price. It must be an exact integer:
 * `BigInt(3.5)` throws, and a float was never a valid VND amount anyway.
 */
export function toVnd(raw: unknown): bigint | null {
  if (typeof raw === 'string') return /^\d+$/.test(raw) ? BigInt(raw) : null;
  if (typeof raw === 'number') return Number.isSafeInteger(raw) && raw >= 0 ? BigInt(raw) : null;
  return null;
}

/**
 * Every configured base price on a listing, as bigint VND đồng. A malformed value
 * is skipped rather than silently becoming `NaN`/`0` and inventing a price.
 */
export function basePrices(listing: ListingStatsFacts): bigint[] {
  const prices: bigint[] = [];
  for (const value of Object.values(listing.modeConfig)) {
    if (!value || typeof value !== 'object') continue;
    const config = value as Record<string, unknown>;
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
    basePrices(listing).length >= listing.bookingModes.length
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
