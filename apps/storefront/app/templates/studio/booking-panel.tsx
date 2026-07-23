import type {
  AvailabilityMode,
  AvailabilityResponse,
  PublicListingDetailResponse,
  QuoteResponse,
} from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import { Separator } from '@booking/ui/components/ui/separator';
import { Link, useSearchParams } from 'react-router';
import { NsI18n, useTranslation } from '../../lib/i18n';
import { storefrontPaths } from '../../lib/locale-paths';
import { packagesForMode } from '../../lib/package-options';
import { DEFAULT_TZ, nightsBetween } from '../../lib/time';
import { useLocale } from '../../lib/use-locale';
import { DailyPicker, FixedDailyPicker } from './booking-panel-daily-picker';
import { HourlyPicker } from './booking-panel-hourly-picker';
import {
  getInventorySelection,
  InventoryPicker,
} from './booking-panel-inventory-picker';
import {
  Breakdown,
  ModeToggle,
  PackagePicker,
  QuoteHeader,
} from './booking-panel-presentation';

interface PanelProps {
  listing: PublicListingDetailResponse;
  mode: AvailabilityMode;
  availability: AvailabilityResponse | null;
  quote: QuoteResponse | null;
  initialStart?: string | null;
  initialEnd?: string | null;
}

const BOOKABLE_MODES: AvailabilityMode[] = ['hourly', 'daily', 'inventory'];

/**
 * The listing booking panel (§16.1): a mode toggle + an availability-driven
 * picker (hourly slots / daily range calendar / inventory quantity) + a live
 * quote. Selection is reflected in the URL, so the route loader re-fetches
 * availability + the quote on every change (SSR-safe, no client API calls).
 */
export function BookingPanel({
  listing,
  mode,
  availability,
  quote,
  initialStart,
  initialEnd,
}: PanelProps) {
  const { t } = useTranslation(NsI18n.Listing);
  const locale = useLocale();
  const [sp, setSp] = useSearchParams();
  const tz = availability?.timezone ?? DEFAULT_TZ;
  const modes = listing.bookingModes.filter((item): item is AvailabilityMode =>
    (BOOKABLE_MODES as string[]).includes(item),
  );
  const fixedPackages = listing.bookingSelection === 'fixed_packages';
  const packages = packagesForMode(listing.modeConfig, mode);
  const packageId = sp.get('packageId');
  const selectedPackage = packages.find((item) => item.id === packageId) ?? null;

  // Inventory opens with a complete default window (today → tomorrow, qty 1)
  // already shown in the picker, so read the selection from the picker's own
  // defaults instead of the URL — which only carries them after an edit.
  const inventory =
    mode === 'inventory' ? getInventorySelection(sp, listing.modeConfig, tz) : null;
  const start = inventory ? inventory.start : (sp.get('start') ?? initialStart ?? null);
  const end = inventory ? inventory.end : (sp.get('end') ?? initialEnd ?? null);
  const selectedDays =
    mode === 'daily' && sp.get('from') && sp.get('to')
      ? nightsBetween(sp.get('from')!, sp.get('to')!)
      : null;

  function switchMode(next: AvailabilityMode): void {
    setSp({ mode: next }, { preventScrollReset: true });
  }

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

  return (
    <div className="rounded-lg bg-card p-5 text-card-foreground shadow-sm">
      <div className="space-y-5">
        <QuoteHeader
          quote={quote}
          listing={listing}
          mode={mode}
          start={start}
          end={end}
          selectedDays={selectedDays}
        />

        {modes.length > 1 ? <ModeToggle modes={modes} active={mode} onSelect={switchMode} /> : null}

        {fixedPackages ? (
          <PackagePicker
            packages={packages}
            selectedId={packageId}
            fallbackPhoto={listing.photos[0]}
            onSelect={(id) => {
              const next = new URLSearchParams({ mode, packageId: id });
              setSp(next, { preventScrollReset: true });
            }}
          />
        ) : null}

        {(!fixedPackages || selectedPackage) && mode === 'hourly' ? (
          <HourlyPicker
            availability={availability}
            sp={sp}
            setSp={setSp}
            tz={tz}
            selectedStart={start}
            selectedEnd={end}
            fixedPackage={fixedPackages}
          />
        ) : (!fixedPackages || selectedPackage) && mode === 'daily' ? (
          fixedPackages && selectedPackage ? (
            <FixedDailyPicker
              availability={availability}
              listing={listing}
              sp={sp}
              setSp={setSp}
              tz={tz}
              durationDays={selectedPackage.duration}
            />
          ) : (
            <DailyPicker
              availability={availability}
              listing={listing}
              sp={sp}
              setSp={setSp}
              tz={tz}
            />
          )
        ) : inventory ? (
          <InventoryPicker
            availability={availability}
            selection={inventory}
            sp={sp}
            setSp={setSp}
            tz={tz}
          />
        ) : null}

        {quote ? (
          <>
            <Separator />
            <Breakdown quote={quote} />
          </>
        ) : null}

        <Button asChild={canBook} className="w-full" disabled={!canBook}>
          {canBook ? (
            <Link to={`${storefrontPaths.checkout(locale)}?${checkoutParams.toString()}`}>
              {t('bookNow')}
            </Link>
          ) : (
            <span>{t('selectToContinue')}</span>
          )}
        </Button>
      </div>
    </div>
  );
}
