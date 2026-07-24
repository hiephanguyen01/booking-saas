import type {
  AvailabilityMode,
  AvailabilityResponse,
  PublicListingDetailResponse,
  QuoteResponse,
} from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import { Separator } from '@booking/ui/components/ui/separator';
import { Link } from 'react-router';
import { NsI18n, useTranslation } from '../../lib/i18n';
import { DailyPicker, FixedDailyPicker } from './booking-panel-daily-picker';
import { HourlyPicker } from './booking-panel-hourly-picker';
import { InventoryPicker } from './booking-panel-inventory-picker';
import {
  Breakdown,
  ModeToggle,
  PackagePicker,
  QuoteHeader,
} from './booking-panel-presentation';
import { useBookingPanelController } from './use-booking-panel-controller';

interface PanelProps {
  listing: PublicListingDetailResponse;
  mode: AvailabilityMode;
  availability: AvailabilityResponse | null;
  quote: QuoteResponse | null;
  initialStart?: string | null;
  initialEnd?: string | null;
}

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
  const {
    canBook,
    checkoutHref,
    end,
    fixedPackages,
    inventory,
    modes,
    packageId,
    packages,
    pickerReady,
    searchParams,
    selectedDays,
    selectedPackage,
    selectPackage,
    setSearchParams,
    start,
    switchMode,
    timezone,
  } = useBookingPanelController({
    listing,
    mode,
    availability,
    quote,
    initialStart,
    initialEnd,
  });

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
            onSelect={selectPackage}
          />
        ) : null}

        {pickerReady && mode === 'hourly' ? (
          <HourlyPicker
            availability={availability}
            sp={searchParams}
            setSp={setSearchParams}
            tz={timezone}
            selectedStart={start}
            selectedEnd={end}
            fixedPackage={fixedPackages}
          />
        ) : pickerReady && mode === 'daily' ? (
          fixedPackages && selectedPackage ? (
            <FixedDailyPicker
              availability={availability}
              listing={listing}
              sp={searchParams}
              setSp={setSearchParams}
              tz={timezone}
              durationDays={selectedPackage.duration}
            />
          ) : (
            <DailyPicker
              availability={availability}
              listing={listing}
              sp={searchParams}
              setSp={setSearchParams}
              tz={timezone}
            />
          )
        ) : inventory ? (
          <InventoryPicker
            availability={availability}
            selection={inventory}
            sp={searchParams}
            setSp={setSearchParams}
            tz={timezone}
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
            <Link to={checkoutHref}>{t('bookNow')}</Link>
          ) : (
            <span>{t('selectToContinue')}</span>
          )}
        </Button>
      </div>
    </div>
  );
}
