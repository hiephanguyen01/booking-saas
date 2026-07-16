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
import { Card, CardContent } from '@booking/ui/components/ui/card';
import { Input } from '@booking/ui/components/ui/input';
import { Separator } from '@booking/ui/components/ui/separator';
import { cn } from '@booking/ui/lib/utils';
import { useMemo, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { NsI18n, useTranslation } from '../../lib/i18n';
import { storefrontPaths } from '../../lib/locale-paths';
import {
  DEFAULT_TZ,
  addDays,
  dateOnlyToLocal,
  localToDateOnly,
  nightsBetween,
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
}

const BOOKABLE_MODES: AvailabilityMode[] = ['hourly', 'daily', 'inventory'];

/**
 * The listing booking panel (§16.1): a mode toggle + an availability-driven
 * picker (hourly slots / daily range calendar / inventory quantity) + a live
 * quote. Selection is reflected in the URL, so the route loader re-fetches
 * availability + the quote on every change (SSR-safe, no client API calls).
 */
export function BookingPanel({ listing, mode, availability, quote }: PanelProps) {
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
  const start = inventory ? inventory.start : sp.get('start');
  const end = inventory ? inventory.end : sp.get('end');

  function switchMode(next: AvailabilityMode): void {
    setSp({ mode: next }); // reset the selection when the mode changes
  }

  const checkoutParams = new URLSearchParams({ listing: listing.slug, mode });
  if (start) checkoutParams.set('start', start);
  if (end) checkoutParams.set('end', end);
  if (inventory) checkoutParams.set('qty', String(inventory.qty));
  const canBook = Boolean(start && end);

  return (
    <Card className="sticky top-28 rounded-2xl border-border shadow-lg">
      <CardContent className="space-y-5 p-6">
        <QuoteHeader quote={quote} listing={listing} />

        {modes.length > 1 ? (
          <ModeToggle modes={modes} active={mode} onSelect={switchMode} />
        ) : null}

        {mode === 'hourly' ? (
          <HourlyPicker availability={availability} sp={sp} setSp={setSp} tz={tz} />
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

        <Button asChild={canBook} size="control" className="w-full text-base" disabled={!canBook}>
          {canBook ? (
            <Link to={`${storefrontPaths.checkout(locale)}?${checkoutParams.toString()}`}>
              {t('bookNow')}
            </Link>
          ) : (
            <span>{t('selectToContinue')}</span>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}

function QuoteHeader({
  quote,
  listing,
}: {
  quote: QuoteResponse | null;
  listing: PublicListingDetailResponse;
}) {
  const { t } = useTranslation(NsI18n.Listing);
  const from = formatVnd(fromPrice(listing.modeConfig));
  return (
    <div className="flex items-baseline gap-2">
      {quote ? (
        <>
          <span className="text-2xl font-bold text-foreground">{formatVnd(quote.subtotal)}</span>
          <span className="text-sm text-muted-foreground">{t('subtotalEstimate')}</span>
        </>
      ) : from ? (
        <>
          <span className="text-2xl font-bold text-foreground">{from}</span>
          <span className="text-sm text-muted-foreground">{t('fromPrice')}</span>
        </>
      ) : (
        <span className="text-lg font-semibold">{t('pickScheduleForPrice')}</span>
      )}
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
    <div className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1">
      {modes.map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onSelect(m)}
          className={cn(
            'rounded-lg px-2 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            m === active
              ? 'bg-background text-foreground shadow-sm'
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
}: {
  availability: AvailabilityResponse | null;
  sp: URLSearchParams;
  setSp: (next: URLSearchParams) => void;
  tz: string;
}) {
  const { t } = useTranslation(NsI18n.Listing);
  const today = todayInTz(tz);
  const day = sp.get('day') || today;
  const slots: HourlySlot[] =
    availability?.mode === 'hourly' ? (availability.days[0]?.slots ?? []) : [];
  const selectedStart = sp.get('start');

  function pickDay(nextDay: string): void {
    const next = new URLSearchParams(sp);
    next.set('mode', 'hourly');
    next.set('day', nextDay);
    next.delete('start');
    next.delete('end');
    setSp(next);
  }

  function pickSlot(slot: HourlySlot): void {
    const next = new URLSearchParams(sp);
    next.set('mode', 'hourly');
    next.set('day', day);
    next.set('start', slot.startUtc);
    next.set('end', slot.endUtc);
    setSp(next);
  }

  const available = slots.filter((s) => s.available);

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

      <PickerLabel>{t('pickSlot')}</PickerLabel>
      {available.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border py-6 text-center text-sm text-muted-foreground">
          {t('noSlots')}
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {available.map((slot) => {
            const isSelected = slot.startUtc === selectedStart;
            return (
              <button
                key={slot.startUtc}
                type="button"
                onClick={() => pickSlot(slot)}
                className={cn(
                  'flex flex-col items-center rounded-lg border px-1 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  isSelected
                    ? 'border-primary bg-primary/10 font-semibold text-primary'
                    : 'border-border hover:border-primary/50',
                )}
              >
                <span>{timeInTz(slot.startUtc, tz)}</span>
                <span className="text-[11px] text-muted-foreground">{formatVnd(slot.price)}</span>
              </button>
            );
          })}
        </div>
      )}
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
    params.delete('start');
    params.delete('end');
    if (!next?.from) {
      params.delete('from');
      params.delete('to');
      setSp(params);
      return;
    }
    const fromStr = localToDateOnly(next.from);
    params.set('from', fromStr);
    if (next.to && next.to.getTime() !== next.from.getTime()) {
      const toStr = localToDateOnly(next.to);
      params.set('to', toStr);
      // The stored nights are [from checkin, to checkout) as UTC instants.
      params.set('start', zonedToUtcIso(fromStr, checkinTime, tz));
      params.set('end', zonedToUtcIso(toStr, checkoutTime, tz));
    } else {
      params.delete('to');
    }
    setSp(params);
  }

  // A day is unbookable if it's not in the open set (booked/blocked/closed).
  function isDisabled(date: Date): boolean {
    return !openDates.has(localToDateOnly(date));
  }

  const nights = fromDate && toDate ? nightsBetween(fromDate, toDate) : 0;

  return (
    <div className="space-y-2">
      <PickerLabel>{t('pickDates')}</PickerLabel>
      <Calendar
        mode="range"
        selected={range}
        onSelect={onSelect}
        disabled={isDisabled}
        min={minNights + 1}
        className="rounded-lg border border-border p-2"
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
  const parsedQty = Number(sp.get('qty') || '1');
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
    <dl className="space-y-1.5 text-sm">
      {quote.lineItems.map((line, idx) => (
        <div key={idx} className="flex justify-between text-muted-foreground">
          <dt>
            {line.label}
            {line.block ? ` (${t('package')})` : ''}
          </dt>
          <dd>{formatVnd(line.amount)}</dd>
        </div>
      ))}
      <Separator className="my-2" />
      <div className="flex justify-between font-semibold text-foreground">
        <dt>{t('subtotal')}</dt>
        <dd>{formatVnd(quote.subtotal)}</dd>
      </div>
      <div className="flex justify-between text-muted-foreground">
        <dt>{t('deposit')}</dt>
        <dd>{formatVnd(quote.depositAmount)}</dd>
      </div>
      {quote.securityDeposit !== '0' ? (
        <div className="flex justify-between text-muted-foreground">
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
