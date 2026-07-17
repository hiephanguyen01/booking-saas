import type {
  AvailabilityMode,
  AvailabilityResponse,
  DayAvailability,
  HourlySlot,
  PublicListingDetailResponse,
  QuoteResponse,
} from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import { Calendar } from '@booking/ui/components/ui/calendar';
import { Input } from '@booking/ui/components/ui/input';
import { Separator } from '@booking/ui/components/ui/separator';
import { cn } from '@booking/ui/lib/utils';
import { useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { eligibleDailyRange, normalizeDailyRange } from '../../lib/daily-range';
import { NsI18n, useTranslation } from '../../lib/i18n';
import { storefrontPaths } from '../../lib/locale-paths';
import {
  DEFAULT_TZ,
  addDays,
  dateOnlyToLocal,
  hoursBetween,
  localToDateOnly,
  timeInTz,
  todayInTz,
  zonedToUtcIso,
} from '../../lib/time';
import { formatVnd } from '../../lib/ui';
import { useLocale } from '../../lib/use-locale';

/** Local mirror of react-day-picker's DateRange (not a direct storefront dep). */
type DateRange = { from: Date | undefined; to?: Date | undefined };

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
  const modes = listing.bookingModes.filter((m): m is AvailabilityMode =>
    (BOOKABLE_MODES as string[]).includes(m),
  );

  // Inventory opens with a complete default window (today → tomorrow, qty 1)
  // already shown in the picker, so read the selection from the picker's own
  // defaults instead of the URL — which only carries them after an edit.
  const inventory = mode === 'inventory' ? inventorySelection(sp, listing.modeConfig, tz) : null;
  const start = inventory ? inventory.start : (sp.get('start') ?? initialStart ?? null);
  const end = inventory ? inventory.end : (sp.get('end') ?? initialEnd ?? null);

  function switchMode(next: AvailabilityMode): void {
    setSp({ mode: next }); // reset the selection when the mode changes
  }

  const checkoutParams = new URLSearchParams({ listing: listing.slug, mode });
  if (start) checkoutParams.set('start', start);
  if (end) checkoutParams.set('end', end);
  if (inventory) checkoutParams.set('qty', String(inventory.qty));
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
        <QuoteHeader quote={quote} listing={listing} mode={mode} start={start} end={end} />

        {modes.length > 1 ? <ModeToggle modes={modes} active={mode} onSelect={switchMode} /> : null}

        {mode === 'hourly' ? (
          <HourlyPicker
            availability={availability}
            sp={sp}
            setSp={setSp}
            tz={tz}
            selectedStart={start}
            selectedEnd={end}
          />
        ) : mode === 'daily' ? (
          <DailyPicker
            availability={availability}
            listing={listing}
            sp={sp}
            setSp={setSp}
            tz={tz}
          />
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

function QuoteHeader({
  quote,
  listing,
  mode,
  start,
  end,
}: {
  quote: QuoteResponse | null;
  listing: PublicListingDetailResponse;
  mode: AvailabilityMode;
  start: string | null;
  end: string | null;
}) {
  const { t } = useTranslation(NsI18n.Listing);
  const from = formatVnd(fromPrice(listing.modeConfig));
  const selectedHours = start && end ? hoursBetween(start, end) : null;
  const unitLabel: Record<AvailabilityMode, string> = {
    hourly: quote && selectedHours ? t('forHours', { count: selectedHours }) : t('perHour'),
    daily: t('perDay'),
    inventory: t('perItem'),
  };

  return (
    <div className="text-right">
      {quote ? (
        <p className="text-sm text-muted-foreground">
          {t('subtotalEstimate')}{' '}
          <strong className="text-xl text-primary">{formatVnd(quote.subtotal)}</strong>
        </p>
      ) : from ? (
        <p className="text-sm text-muted-foreground">
          {t('fromPriceShort')} <strong className="text-xl text-primary">{from}</strong>
        </p>
      ) : (
        <p className="font-semibold text-foreground">{t('pickScheduleForPrice')}</p>
      )}
      <p className="mt-1 text-xs text-muted-foreground">{unitLabel[mode]}</p>
    </div>
  );
}

function ModeToggle({
  modes,
  active,
  onSelect,
}: {
  modes: AvailabilityMode[];
  active: AvailabilityMode;
  onSelect: (m: AvailabilityMode) => void;
}) {
  const { t } = useTranslation(NsI18n.Listing);
  const label: Record<AvailabilityMode, string> = {
    hourly: t('modeHourly'),
    daily: t('modeDaily'),
    inventory: t('modeInventory'),
  };
  return (
    <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted/70 p-1">
      {modes.map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onSelect(m)}
          className={cn(
            'rounded-md px-2 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            m === active
              ? 'bg-card text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {label[m]}
        </button>
      ))}
    </div>
  );
}

// ── Hourly ───────────────────────────────────────────────────────────────────

function HourlyPicker({
  availability,
  sp,
  setSp,
  tz,
  selectedStart,
  selectedEnd,
}: {
  availability: AvailabilityResponse | null;
  sp: URLSearchParams;
  setSp: (next: URLSearchParams) => void;
  tz: string;
  selectedStart: string | null;
  selectedEnd: string | null;
}) {
  const { t } = useTranslation(NsI18n.Listing);
  const today = todayInTz(tz);
  const day = sp.get('day') || sp.get('date') || today;
  const slots: HourlySlot[] =
    availability?.mode === 'hourly' ? (availability.days[0]?.slots ?? []) : [];
  const [onlyAvailable, setOnlyAvailable] = useState(false);

  function pickDay(nextDay: string): void {
    const next = new URLSearchParams(sp);
    next.set('mode', 'hourly');
    next.set('day', nextDay);
    next.set('date', nextDay);
    next.delete('start');
    next.delete('end');
    setSp(next);
  }

  function pickSlot(slot: HourlySlot): void {
    const next = new URLSearchParams(sp);
    next.set('mode', 'hourly');
    next.set('day', day);
    next.set('date', day);
    next.set('startTime', timeInTz(slot.startUtc, tz));
    next.set('endTime', timeInTz(slot.endUtc, tz));
    next.set('start', slot.startUtc);
    next.set('end', slot.endUtc);
    setSp(next);
  }

  const available = slots.filter((slot) => slot.available);
  const visibleSlots = onlyAvailable ? available : slots;
  const selectedUnavailable = Boolean(
    selectedStart &&
    selectedEnd &&
    !slots.some(
      (slot) => slot.startUtc === selectedStart && slot.endUtc === selectedEnd && slot.available,
    ),
  );

  return (
    <div className="space-y-3">
      <label className="flex flex-col gap-1.5">
        <PickerLabel>{t('pickDay')}</PickerLabel>
        <Input
          type="date"
          value={day}
          min={today}
          onChange={(e) => e.target.value && pickDay(e.target.value)}
        />
      </label>

      <div className="flex items-center justify-between gap-3">
        <PickerLabel>{t('pickSlot')}</PickerLabel>
        {slots.some((slot) => !slot.available) ? (
          <button
            type="button"
            onClick={() => setOnlyAvailable((current) => !current)}
            className="text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {onlyAvailable ? t('showAllSlots') : t('showOnlyAvailable')}
          </button>
        ) : null}
      </div>
      {visibleSlots.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border py-6 text-center text-sm text-muted-foreground">
          {t('noSlots')}
        </p>
      ) : (
        <div className="grid max-h-60 grid-cols-2 gap-2 overflow-y-auto pr-1">
          {visibleSlots.map((slot, slotIndex) => {
            const isSelected = slot.startUtc === selectedStart && slot.endUtc === selectedEnd;
            return (
              <button
                key={`${slot.startUtc}-${slot.endUtc}-${slotIndex}`}
                type="button"
                onClick={() => slot.available && pickSlot(slot)}
                disabled={!slot.available}
                className={cn(
                  'flex flex-col items-center rounded-lg border px-1 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  isSelected
                    ? 'border-primary bg-primary/10 font-semibold text-primary'
                    : slot.available
                      ? 'border-border bg-background/40 hover:border-primary/50 hover:bg-muted/40'
                      : 'cursor-not-allowed border-border/60 bg-muted/50 text-muted-foreground opacity-60',
                )}
              >
                <span>
                  {timeInTz(slot.startUtc, tz)}–{timeInTz(slot.endUtc, tz)}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {slot.available ? formatVnd(slot.price) : t('unavailableSlot')}
                </span>
              </button>
            );
          })}
        </div>
      )}
      {selectedUnavailable ? (
        <p role="alert" className="text-xs text-destructive">
          {t('selectedSlotUnavailable')}
        </p>
      ) : null}
    </div>
  );
}

// ── Daily ────────────────────────────────────────────────────────────────────

function DailyPicker({
  availability,
  listing,
  sp,
  setSp,
  tz,
}: {
  availability: AvailabilityResponse | null;
  listing: PublicListingDetailResponse;
  sp: URLSearchParams;
  setSp: (next: URLSearchParams) => void;
  tz: string;
}) {
  const { t } = useTranslation(NsI18n.Listing);
  const days: DayAvailability[] = availability?.mode === 'daily' ? availability.days : [];
  const dailyCfg = (listing.modeConfig.daily ?? {}) as {
    checkinTime?: string;
    checkoutTime?: string;
    minNights?: number;
    maxNights?: number;
  };
  const checkinTime = dailyCfg.checkinTime ?? '14:00';
  const checkoutTime = dailyCfg.checkoutTime ?? '12:00';
  const minNights = dailyCfg.minNights ?? 1;
  const maxNights = Number.isFinite(Number(dailyCfg.maxNights)) ? Number(dailyCfg.maxNights) : null;

  const openDates = useMemo(
    () => new Set(days.filter((d) => d.status === 'available').map((d) => d.date)),
    [days],
  );

  const fromDate = sp.get('from');
  const toDate = sp.get('to');
  const range: DateRange | undefined = fromDate
    ? { from: dateOnlyToLocal(fromDate), to: toDate ? dateOnlyToLocal(toDate) : undefined }
    : undefined;

  function onSelect(next: DateRange | undefined): void {
    const params = new URLSearchParams(sp);
    params.set('mode', 'daily');
    if (!next?.from) {
      params.delete('from');
      params.delete('to');
      params.delete('start');
      params.delete('end');
      setSp(params);
      return;
    }
    const fromStr = localToDateOnly(next.from);
    params.set('from', fromStr);

    if (next.to) {
      const selectedTo = localToDateOnly(next.to);
      params.set('to', selectedTo);
      const bookable = eligibleDailyRange(fromStr, selectedTo, minNights, maxNights);
      if (bookable) {
        params.set('start', zonedToUtcIso(bookable.from, checkinTime, tz));
        params.set('end', zonedToUtcIso(bookable.to, checkoutTime, tz));
      } else {
        params.delete('start');
        params.delete('end');
      }
    } else {
      params.delete('to');
      params.delete('start');
      params.delete('end');
    }
    setSp(params);
  }

  // A day is unbookable if it's not in the open set (booked/blocked/closed).
  function isDisabled(date: Date): boolean {
    return !openDates.has(localToDateOnly(date));
  }

  const normalized = normalizeDailyRange(fromDate ?? undefined, toDate ?? undefined);
  const nights = normalized?.nights ?? 0;

  return (
    <div className="space-y-2">
      <PickerLabel>{t('pickDates')}</PickerLabel>
      <Calendar
        mode="range"
        selected={range}
        onSelect={onSelect}
        disabled={isDisabled}
        excludeDisabled
        className="rounded-lg border border-border bg-background/40 p-2"
      />
      {nights > 0 ? (
        <p className="text-sm text-muted-foreground">
          {t('nights', { count: nights })}
          {nights < minNights ? ` · ${t('minNights', { count: minNights })}` : ''}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">{t('selectRange')}</p>
      )}
    </div>
  );
}

// ── Inventory ────────────────────────────────────────────────────────────────

interface InventorySelection {
  from: string;
  to: string;
  qty: number;
  unit: 'hour' | 'day';
  start: string;
  end: string;
}

/** Rental window: pickup at day start, return at end day start (unit=day) — the
 *  API validates the exact window; times use the resource zone. */
function inventoryWindow(
  from: string,
  to: string,
  unit: 'hour' | 'day',
  tz: string,
): { start: string; end: string } {
  return {
    start: zonedToUtcIso(from, unit === 'day' ? '00:00' : '08:00', tz),
    end: zonedToUtcIso(to, unit === 'day' ? '00:00' : '18:00', tz),
  };
}

function inventorySelection(
  sp: URLSearchParams,
  modeConfig: Record<string, unknown>,
  tz: string,
): InventorySelection {
  const unit = ((modeConfig.inventory ?? {}) as { unit?: 'hour' | 'day' }).unit ?? 'day';
  const from = (sp.get('from') || todayInTz(tz)).slice(0, 10);
  const to = (sp.get('to') || addDays(from, 1)).slice(0, 10);
  const parsedQty = Number(sp.get('qty') || sp.get('quantity') || '1');
  const qty = Number.isFinite(parsedQty) && parsedQty >= 1 ? Math.floor(parsedQty) : 1;
  return { from, to, qty, unit, ...inventoryWindow(from, to, unit, tz) };
}

function InventoryPicker({
  availability,
  selection,
  sp,
  setSp,
  tz,
}: {
  availability: AvailabilityResponse | null;
  selection: InventorySelection;
  sp: URLSearchParams;
  setSp: (next: URLSearchParams) => void;
  tz: string;
}) {
  const { t } = useTranslation(NsI18n.Listing);
  const today = todayInTz(tz);
  const remaining = availability?.mode === 'inventory' ? availability.inventory.remaining : 0;
  const { from: fromDate, to: toDate, qty, unit } = selection;

  function update(patch: { from?: string; to?: string; qty?: number }): void {
    const next = new URLSearchParams(sp);
    const nf = patch.from ?? fromDate;
    const nt = patch.to ?? toDate;
    const window = inventoryWindow(nf, nt, unit, tz);
    next.set('mode', 'inventory');
    next.set('from', nf);
    next.set('to', nt);
    next.set('qty', String(patch.qty ?? qty));
    next.set('start', window.start);
    next.set('end', window.end);
    setSp(next);
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5">
          <PickerLabel>{t('checkin')}</PickerLabel>
          <Input
            type="date"
            value={fromDate}
            min={today}
            onChange={(e) => e.target.value && update({ from: e.target.value })}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <PickerLabel>{t('checkout')}</PickerLabel>
          <Input
            type="date"
            value={toDate}
            min={addDays(fromDate, 1)}
            onChange={(e) => e.target.value && update({ to: e.target.value })}
          />
        </label>
      </div>

      <div className="flex items-center justify-between">
        <PickerLabel>{t('quantity')}</PickerLabel>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-11"
            disabled={qty <= 1}
            onClick={() => update({ qty: Math.max(1, qty - 1) })}
          >
            −
          </Button>
          <span className="w-8 text-center text-sm font-semibold">{qty}</span>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-11"
            disabled={qty >= remaining}
            onClick={() => update({ qty: Math.min(remaining, qty + 1) })}
          >
            +
          </Button>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">{t('remaining', { count: remaining })}</p>
    </div>
  );
}

// ── Shared ───────────────────────────────────────────────────────────────────

function Breakdown({ quote }: { quote: QuoteResponse }) {
  const { t } = useTranslation(NsI18n.Listing);
  return (
    <dl className="rounded-lg bg-muted/40 p-3 text-sm">
      {quote.lineItems.map((line, idx) => (
        <div key={idx} className="flex justify-between gap-3 py-0.5 text-muted-foreground">
          <dt>
            {line.label}
            {line.block ? ` (${t('package')})` : ''}
          </dt>
          <dd>{formatVnd(line.amount)}</dd>
        </div>
      ))}
      <Separator className="my-2.5" />
      <div className="flex justify-between gap-3 font-semibold text-foreground">
        <dt>{t('subtotal')}</dt>
        <dd>{formatVnd(quote.subtotal)}</dd>
      </div>
      <div className="mt-1 flex justify-between gap-3 text-muted-foreground">
        <dt>{t('deposit')}</dt>
        <dd>{formatVnd(quote.depositAmount)}</dd>
      </div>
      {quote.securityDeposit !== '0' ? (
        <div className="mt-1 flex justify-between gap-3 text-muted-foreground">
          <dt>{t('securityDeposit')}</dt>
          <dd>{formatVnd(quote.securityDeposit)}</dd>
        </div>
      ) : null}
    </dl>
  );
}

/** Not `@booking/ui`'s `FieldLabel`: these sit inside `<label>` wrappers, so this
 *  renders a `<span>` rather than a nested `<label>`. */
function PickerLabel({ children }: { children: ReactNode }) {
  return (
    <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
      {children}
    </span>
  );
}

/** Cheapest configured base price across modes (for the "from" price). */
function fromPrice(modeConfig: Record<string, unknown>): string | null {
  const prices: number[] = [];
  for (const cfg of Object.values(modeConfig)) {
    if (cfg && typeof cfg === 'object') {
      const c = cfg as Record<string, unknown>;
      for (const key of ['basePrice', 'basePricePerNight']) {
        const n = Number(c[key]);
        if (Number.isFinite(n) && n > 0) prices.push(n);
      }
    }
  }
  return prices.length > 0 ? String(Math.min(...prices)) : null;
}
