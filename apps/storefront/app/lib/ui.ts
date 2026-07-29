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

export function attributeSummary(attributes: Record<string, unknown>, max = 3): string {
  return Object.values(attributes)
    .filter((v) => v !== null && v !== '' && typeof v !== 'boolean')
    .slice(0, max)
    .map((v) => String(v))
    .join(' · ');
}

export interface ListingLocation {
  address?: string | null;
  wardName?: string | null;
  provinceName?: string | null;
  workingArea?: string | null;
}

/** Compact cards show the administrative area; detail pages include the street address. */
export function formatListingLocation(
  location: ListingLocation,
  detail: 'compact' | 'full' = 'compact',
): string | null {
  const values =
    detail === 'full'
      ? [location.address, location.workingArea, location.wardName, location.provinceName]
      : [location.workingArea, location.wardName, location.provinceName];
  const unique = values
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .filter(
      (value, index, items) =>
        items.findIndex(
          (item) => item.localeCompare(value, 'vi', { sensitivity: 'base' }) === 0,
        ) === index,
    );
  return unique.length ? unique.join(', ') : null;
}

/** A Google Maps search URL for a formatted location, or null when there's none. */
export function googleMapsHref(location: string | null): string | null {
  return location
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`
    : null;
}
