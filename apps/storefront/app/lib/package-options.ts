import type { AvailabilityMode, PublicListingDetailResponse } from '@booking/contracts';

export interface PublicPackageOption {
  id: string;
  name: string;
  description?: string;
  photos: string[];
  mode: 'hourly' | 'daily';
  duration: number;
  price: string;
}

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
    if (
      typeof row.id !== 'string' ||
      typeof row.name !== 'string' ||
      typeof row.price !== 'string' ||
      !Number.isInteger(duration)
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
        price: row.price,
      },
    ];
  });
}

export function selectedPackageForListing(
  listing: PublicListingDetailResponse,
  mode: AvailabilityMode,
  packageId: string | null,
): PublicPackageOption | null {
  if (!packageId) return null;
  return packagesForMode(listing.modeConfig, mode).find((item) => item.id === packageId) ?? null;
}
