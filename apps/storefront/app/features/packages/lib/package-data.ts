import type { PublicListingDetailResponse } from '@booking/contracts';
import { minMoney } from '~/lib/money';
import { packagesForMode, type PublicPackageOption } from '~/lib/package-options';

export function listingPackages(listing: PublicListingDetailResponse): PublicPackageOption[] {
  return packagesForMode(listing.modeConfig, 'hourly');
}

export function minimumPackagePrice(packages: PublicPackageOption[]): string | null {
  return minMoney(packages.map((item) => item.price));
}
