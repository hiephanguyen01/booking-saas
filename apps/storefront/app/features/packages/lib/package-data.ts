import type { PublicListingDetailResponse } from '@booking/contracts';
import { packagesForMode, type PublicPackageOption } from '~/lib/package-options';

export function listingPackages(listing: PublicListingDetailResponse): PublicPackageOption[] {
  return packagesForMode(listing.modeConfig, 'hourly');
}

export function minimumPackagePrice(packages: PublicPackageOption[]): string | null {
  if (!packages.length) return null;
  return packages.reduce(
    (lowest, item) => (BigInt(item.price) < BigInt(lowest) ? item.price : lowest),
    packages[0]!.price,
  );
}
