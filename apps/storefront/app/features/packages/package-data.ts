import type { PublicListingDetailResponse } from '@booking/contracts';
import { packagesForMode, type PublicPackageOption } from '~/lib/package-options';

export interface PackageDetails {
  style: string | null;
  editedPhotos: number | null;
  rawFiles: boolean | null;
}

export function listingPackages(listing: PublicListingDetailResponse): PublicPackageOption[] {
  return packagesForMode(listing.modeConfig, 'hourly');
}

export function packageDetails(attributes: Record<string, unknown>): PackageDetails {
  const editedPhotos = Number(attributes.editedPhotos);
  return {
    style: typeof attributes.photographyStyle === 'string' ? attributes.photographyStyle : null,
    editedPhotos: Number.isInteger(editedPhotos) && editedPhotos >= 0 ? editedPhotos : null,
    rawFiles: typeof attributes.rawFiles === 'boolean' ? attributes.rawFiles : null,
  };
}

export function minimumPackagePrice(packages: PublicPackageOption[]): string | null {
  if (!packages.length) return null;
  return packages.reduce(
    (lowest, item) => (BigInt(item.price) < BigInt(lowest) ? item.price : lowest),
    packages[0]!.price,
  );
}

export function packageDurationHours(item: PublicPackageOption): number {
  return item.duration / 60;
}
