/**
 * The unit a "from" price is quoted in.
 *
 * These were previously the Vietnamese literals `'giờ' | 'ngày'`, produced
 * server-side and baked into the type, which made the price row untranslatable
 * on the `/en` routes the storefront already serves. Render them through the
 * `listing.perHour` / `listing.perDay` i18n keys.
 */
export type PriceUnit = 'hour' | 'day' | 'item' | 'session' | 'package';

/** VND đồng digit string → "1.200.000₫", without converting money through a JS float. */
export function formatVnd(amount: string | null | undefined): string | null {
  if (amount == null || !/^\d+$/.test(amount)) return null;
  return `${BigInt(amount).toLocaleString('vi-VN')}₫`;
}

/**
 * Avatar initials from a display name: the first letter of its first two words.
 *
 * The fallback is explicit per surface because each avatar falls back to its own
 * placeholder ("ST" for a studio card, "BK" for the brand, "?" for a customer).
 * Distinct from `userInitials` in `~/features/account/lib/account-nav`, which
 * takes the *last* two words — Vietnamese given names come last, so the signed-in
 * user's own avatar is keyed on those.
 */
export function nameInitials(name: string, fallback: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || fallback
  );
}

export interface ListingLocation {
  address?: string | null;
  wardName?: string | null;
  provinceName?: string | null;
  workingArea?: string | null;
}

/**
 * A collator built once. `String.localeCompare(other, locale, options)` cannot
 * reuse V8's cached collator when an options bag is passed, so calling it inside
 * a filter costs roughly an order of magnitude more than an explicit instance —
 * and this runs per card on a catalog page that renders up to 48 of them.
 */
const VI_COLLATOR = new Intl.Collator('vi', { sensitivity: 'base' });

/** Compact cards show the administrative area; detail pages include the street address. */
export function formatListingLocation(
  location: ListingLocation,
  detail: 'compact' | 'full' = 'compact',
): string | null {
  const values =
    detail === 'full'
      ? [location.address, location.workingArea, location.wardName, location.provinceName]
      : [location.workingArea, location.wardName, location.provinceName];

  // "Quận 1" and "quận 1" are the same place, so dedupe accent- and case-insensitively.
  const unique: string[] = [];
  for (const raw of values) {
    const value = raw?.trim();
    if (!value) continue;
    if (unique.some((seen) => VI_COLLATOR.compare(seen, value) === 0)) continue;
    unique.push(value);
  }
  return unique.length ? unique.join(', ') : null;
}

/** A Google Maps search URL for a formatted location, or null when there's none. */
export function googleMapsHref(location: string | null): string | null {
  return location
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`
    : null;
}
