/**
 * The "from" price of a listing, read straight off its `mode_config` (§7.3).
 *
 * Shared kernel: the listing module renders it on the post page and the reviewer
 * checklist, catalog search ranks by it, and the favorites card shows it. Keeping
 * one implementation is what stops a listing from advertising three different
 * "from" prices depending on which screen you are looking at.
 *
 * Pure and framework-free — the caller supplies the facts, this decides what they
 * mean.
 */
import { toVnd } from '../../money/money';

/** The slice of a listing that determines its configured prices. */
export interface PricedListingFacts {
  bookingModes: readonly string[];
  bookingSelection: 'flexible_duration' | 'fixed_packages';
  modeConfig: Record<string, unknown>;
}

/**
 * Every configured base price on a listing, as bigint VND đồng.
 *
 * Only ENABLED modes count — a price left behind in `mode_config` for a mode the
 * partner has since turned off must not resurface as the "from" price. A
 * `fixed_packages` listing prices through its active packages instead; an
 * inactive package is skipped. A malformed value is skipped rather than silently
 * becoming `NaN`/`0` and inventing a price.
 */
export function basePrices(listing: PricedListingFacts): bigint[] {
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

/** Lowest configured base price as a VND đồng digit string, or null if none. */
export function lowestBasePrice(listing: PricedListingFacts): string | null {
  const prices = basePrices(listing);
  if (prices.length === 0) return null;
  return prices.reduce((a, b) => (b < a ? b : a)).toString();
}
