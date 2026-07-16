import {
  Aperture,
  Camera,
  Package,
  Shirt,
  Sparkles,
  Tag,
  UserRound,
  type LucideIcon,
} from 'lucide-react';

/** Maps a listing type slug to a lucide icon for the menu + cards. */
export function typeIcon(slug: string): LucideIcon {
  if (slug.includes('studio')) return Camera;
  if (slug.includes('model')) return UserRound;
  if (slug.includes('equipment')) return Package;
  if (slug.includes('makeup')) return Sparkles;
  if (slug.includes('photo')) return Aperture;
  if (slug.includes('clothes') || slug.includes('costume') || slug.includes('fashion'))
    return Shirt;
  return Tag;
}

/**
 * The unit a "from" price is quoted in.
 *
 * These were previously the Vietnamese literals `'giờ' | 'ngày'`, produced
 * server-side and baked into the type, which made the price row untranslatable
 * on the `/en` routes the storefront already serves. Render them through the
 * `listing.perHour` / `listing.perDay` i18n keys.
 */
export type PriceUnit = 'hour' | 'day';

/** VND đồng digit string → "1.200.000₫". */
export function formatVnd(amount: string | null | undefined): string | null {
  if (amount == null) return null;
  const n = Number(amount);
  return Number.isFinite(n) ? `${n.toLocaleString('vi-VN')}₫` : null;
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
