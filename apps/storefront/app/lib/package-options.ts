import {
  MAX_BOOKING_RANGE_DAYS,
  moneyStringSchema,
  type AvailabilityMode,
  type PublicListingDetailResponse,
} from '@booking/contracts';

export interface PublicPackageOption {
  id: string;
  name: string;
  description?: string;
  photos: string[];
  mode: 'hourly' | 'daily';
  duration: number;
  price: string;
}

/**
 * The offerable packages under one booking mode, read out of the untyped
 * `modeConfig` jsonb.
 *
 * A package is offerable only if it can actually be quoted, so the money shape
 * goes through `moneyStringSchema` and the duration must be a positive integer
 * that a daily range could still cover. Anything else is dropped rather than
 * rendered as a package the customer cannot book.
 */
export function packagesForMode(
  modeConfig: Record<string, unknown>,
  mode: AvailabilityMode,
): PublicPackageOption[] {
  if (mode !== 'hourly' && mode !== 'daily') return [];
  const raw = (modeConfig[mode] as { packages?: unknown[] } | undefined)?.packages ?? [];
  return raw.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const row = item as Record<string, unknown>;
    const duration = Number(mode === 'hourly' ? row.durationMinutes : row.durationDays);
    const price = moneyStringSchema.safeParse(row.price);
    const offerableDuration =
      Number.isInteger(duration) &&
      duration > 0 &&
      (mode !== 'daily' || duration <= MAX_BOOKING_RANGE_DAYS);
    if (
      typeof row.id !== 'string' ||
      typeof row.name !== 'string' ||
      !price.success ||
      !offerableDuration
    )
      return [];
    return [
      {
        id: row.id,
        name: row.name,
        ...(typeof row.description === 'string' ? { description: row.description } : {}),
        photos: Array.isArray(row.photos)
          ? row.photos.filter((photo): photo is string => typeof photo === 'string')
          : [],
        mode,
        duration,
        price: price.data,
      },
    ];
  });
}

/**
 * The i18n key + count that describe a package's length.
 *
 * `duration` is minutes for an hourly package and days for a daily one, so the
 * unit has to come from `mode` — reading it as hours unconditionally mislabels
 * every daily package.
 */
export function packageDurationLabel(item: PublicPackageOption): {
  key: 'packages.packageDuration' | 'packages.durationDays';
  count: number;
} {
  return item.mode === 'daily'
    ? { key: 'packages.durationDays', count: item.duration }
    : { key: 'packages.packageDuration', count: item.duration / 60 };
}

export function selectedPackageForListing(
  listing: PublicListingDetailResponse,
  mode: AvailabilityMode,
  packageId: string | null,
): PublicPackageOption | null {
  if (!packageId) return null;
  return packagesForMode(listing.modeConfig, mode).find((item) => item.id === packageId) ?? null;
}
