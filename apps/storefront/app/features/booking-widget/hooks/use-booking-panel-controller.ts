import type {
  AvailabilityMode,
  AvailabilityResponse,
  PublicListingDetailWithTimezoneResponse,
  QuoteResponse,
} from '@booking/contracts';
import { useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { storefrontPaths } from '~/constants/paths';
import { packagesForMode } from '~/lib/package-options';
import { nightsBetween } from '~/lib/time';
import { useLocale } from '~/hooks/use-locale';
import { getInventorySelection } from '~/features/booking-widget/lib/inventory-selection';

const BOOKABLE_MODES: AvailabilityMode[] = ['hourly', 'daily', 'inventory'];

export function useBookingPanelController({
  listing,
  mode,
  availability,
  quote,
  initialStart,
  initialEnd,
  initialToday,
}: {
  listing: PublicListingDetailWithTimezoneResponse;
  mode: AvailabilityMode;
  availability: AvailabilityResponse | null;
  quote: QuoteResponse | null;
  initialStart?: string | null;
  initialEnd?: string | null;
  initialToday: string;
}) {
  const locale = useLocale();
  const [searchParams, setSearchParams] = useSearchParams();
  const timezone = availability?.timezone ?? listing.timezone;
  const modes = listing.bookingModes.filter((item): item is AvailabilityMode =>
    (BOOKABLE_MODES as string[]).includes(item),
  );
  const fixedPackages = listing.bookingSelection === 'fixed_packages';
  // Parsed once per listing rather than on every render: `packagesForMode` walks the
  // untyped `modeConfig` jsonb and zod-parses each package. Same reason as
  // `use-booking-dialog-controller`, and this panel re-renders on every fetcher tick.
  const packages = useMemo(
    () => packagesForMode(listing.modeConfig, mode),
    [listing.modeConfig, mode],
  );
  const packageId = searchParams.get('packageId');
  const selectedPackage = packages.find((item) => item.id === packageId) ?? null;
  const inventory =
    mode === 'inventory'
      ? getInventorySelection(searchParams, listing.modeConfig, timezone, initialToday)
      : null;
  const start = inventory ? inventory.start : (searchParams.get('start') ?? initialStart ?? null);
  const end = inventory ? inventory.end : (searchParams.get('end') ?? initialEnd ?? null);
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const selectedDays = mode === 'daily' && from && to ? nightsBetween(from, to) : null;
  const checkoutParams = new URLSearchParams({ listing: listing.slug, mode });

  if (start) checkoutParams.set('start', start);
  if (end) checkoutParams.set('end', end);
  if (inventory) checkoutParams.set('qty', String(inventory.qty));
  if (packageId) checkoutParams.set('packageId', packageId);

  const inventoryAvailable = Boolean(
    inventory &&
    availability?.mode === 'inventory' &&
    availability.inventory.remaining >= inventory.qty,
  );
  const canBook = Boolean(
    start && end && (mode === 'inventory' ? inventoryAvailable : Boolean(quote)),
  );

  function switchMode(nextMode: AvailabilityMode): void {
    setSearchParams({ mode: nextMode }, { preventScrollReset: true });
  }

  function selectPackage(nextPackageId: string): void {
    setSearchParams(new URLSearchParams({ mode, packageId: nextPackageId }), {
      preventScrollReset: true,
    });
  }

  return {
    canBook,
    checkoutHref: `${storefrontPaths.checkout(locale)}?${checkoutParams.toString()}`,
    end,
    fixedPackages,
    inventory,
    modes,
    packageId,
    packages,
    pickerReady: !fixedPackages || Boolean(selectedPackage),
    searchParams,
    selectedDays,
    selectedPackage,
    selectPackage,
    setSearchParams,
    start,
    switchMode,
    timezone,
  };
}
