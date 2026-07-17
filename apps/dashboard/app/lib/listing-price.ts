import type { ListingResponse } from '@booking/contracts';

/** Keys under a `mode_config` entry that hold that mode's base unit price. */
const BASE_PRICE_KEYS = ['basePrice', 'basePricePerNight'] as const;

/**
 * The lowest configured base price across a listing's `mode_config`, returned as
 * a VND đồng **digit string** (never a JS number — a large đồng amount would lose
 * precision through `Number`, which CLAUDE.md §2.1 rule 4 forbids). The
 * comparison runs in `bigint` space and the result is fed straight to `<Money>`.
 *
 * Returns `null` when no positive price is configured, so a caller can show
 * "Chưa có giá" instead of a misleading `0 ₫`. A grouped child listing carries no
 * server-side `priceFrom` (only the group does), so this is the per-item price.
 */
export function listingPriceFrom(listing: Pick<ListingResponse, 'modeConfig'>): string | null {
  const config = listing.modeConfig as Record<string, unknown>;
  let min: bigint | null = null;
  for (const entry of Object.values(config)) {
    if (!entry || typeof entry !== 'object') continue;
    const mode = entry as Record<string, unknown>;
    for (const key of BASE_PRICE_KEYS) {
      const value = toPositiveVnd(mode[key]);
      if (value !== null && (min === null || value < min)) min = value;
    }
  }
  return min === null ? null : min.toString();
}

/** A strictly-positive VND đồng amount as a `bigint`, or `null` for anything else. */
function toPositiveVnd(raw: unknown): bigint | null {
  if (typeof raw === 'string' && /^\d+$/.test(raw)) {
    const value = BigInt(raw);
    return value > 0n ? value : null;
  }
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
    return BigInt(Math.round(raw));
  }
  return null;
}
