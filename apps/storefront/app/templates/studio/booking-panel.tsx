import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router';
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
import { Separator } from '@booking/ui/components/ui/separator';
import { cn } from '@booking/ui/lib/utils';
import { useT, type I18n } from '../../lib/i18n';
import { formatVnd } from '../../lib/ui';
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
  const i18n = useT();
  const [sp, setSp] = useSearchParams();
  const tz = availability?.timezone ?? DEFAULT_TZ;
  const modes = listing.bookingModes.filter((m): m is AvailabilityMode =>
    (BOOKABLE_MODES as string[]).includes(m),
  );

  const start = sp.get('start');
  const end = sp.get('end');
  const qty = sp.get('qty') ?? '1';

  function switchMode(next: AvailabilityMode): void {
    setSp({ mode: next }); // reset the selection when the mode changes
  }

  const checkoutParams = new URLSearchParams({ listing: listing.slug, mode });
  if (start) checkoutParams.set('start', start);
  if (end) checkoutParams.set('end', end);
  if (mode === 'inventory') checkoutParams.set('qty', qty);
  const canBook = Boolean(start && end);

  return (
    <Card className="sticky top-28 rounded-2xl border-border shadow-lg">
      <CardContent className="space-y-5 p-6">
        <QuoteHeader quote={quote} listing={listing} i18n={i18n} />

        {modes.length > 1 ? (
          <ModeToggle modes={modes} active={mode} onSelect={switchMode} i18n={i18n} />
        ) : null}

        {mode === 'hourly' ? (
          <HourlyPicker availability={availability} sp={sp} setSp={setSp} tz={tz} i18n={i18n} />
        ) : mode === 'daily' ? (
          <DailyPicker
            availability={availability}
            listing={listing}
            sp={sp}
            setSp={setSp}
            tz={tz}
            i18n={i18n}
          />
        ) : (
          <InventoryPicker
            availability={availability}
            listing={listing}
            sp={sp}
            setSp={setSp}
            tz={tz}
            i18n={i18n}
          />
        )}

        {quote ? (
          <>
            <Separator />
            <Breakdown quote={quote} i18n={i18n} />
          </>
        ) : null}

        <Button asChild={canBook} className="h-11 w-full text-base" disabled={!canBook}>
          {canBook ? (
            <Link to={`/checkout?${checkoutParams.toString()}`}>{i18n.t('listing.bookNow')}</Link>
          ) : (
            <span>{i18n.t('listing.selectToContinue')}</span>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}

function QuoteHeader({
  quote,
  listing,
  i18n,
}: {
  quote: QuoteResponse | null;
  listing: PublicListingDetailResponse;
  i18n: I18n;
}) {
  const from = formatVnd(fromPrice(listing.modeConfig));
  return (
    <div className="flex items-baseline gap-2">
      {quote ? (
        <>
          <span className="text-2xl font-bold text-foreground">{formatVnd(quote.subtotal)}</span>
          <span className="text-sm text-muted-foreground">{i18n.t('listing.subtotalEstimate')}</span>
        </>
      ) : from ? (
        <>
          <span className="text-2xl font-bold text-foreground">{from}</span>
          <span className="text-sm text-muted-foreground">{i18n.t('listing.fromPrice')}</span>
        </>
      ) : (
        <span className="text-lg font-semibold">{i18n.t('listing.pickScheduleForPrice')}</span>
      )}
    </div>
  );
}

function ModeToggle({
  modes,
  active,
  onSelect,
  i18n,
}: {
  modes: AvailabilityMode[];
  active: AvailabilityMode;
  onSelect: (m: AvailabilityMode) => void;
  i18n: I18n;
}) {
  const label: Record<AvailabilityMode, string> = {
    hourly: i18n.t('listing.modeHourly'),
    daily: i18n.t('listing.modeDaily'),
    inventory: i18n.t('listing.modeInventory'),
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
  i18n,
}: {
  availability: AvailabilityResponse | null;
  sp: URLSearchParams;
  setSp: (next: URLSearchParams) => void;
  tz: string;
  i18n: I18n;
}) {
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
        <FieldLabel>{i18n.t('listing.pickDay')}</FieldLabel>
        <input
          type="date"
          value={day}
          min={today}
          onChange={(e) => e.target.value && pickDay(e.target.value)}
          className="h-10 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs"
        />
      </label>

      <FieldLabel>{i18n.t('listing.pickSlot')}</FieldLabel>
      {available.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border py-6 text-center text-sm text-muted-foreground">
          {i18n.t('listing.noSlots')}
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
  i18n,
}: {
  availability: AvailabilityResponse | null;
  listing: PublicListingDetailResponse;
  sp: URLSearchParams;
  setSp: (next: URLSearchParams) => void;
  tz: string;
  i18n: I18n;
}) {
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
      <FieldLabel>{i18n.t('listing.pickDates')}</FieldLabel>
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
          {i18n.t('listing.nights', { count: nights })}
          {nights < minNights ? ` · ${i18n.t('listing.minNights', { count: minNights })}` : ''}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">{i18n.t('listing.selectRange')}</p>
      )}
    </div>
  );
}

// ── Inventory ────────────────────────────────────────────────────────────────

function InventoryPicker({
  availability,
  listing,
  sp,
  setSp,
  tz,
  i18n,
}: {
  availability: AvailabilityResponse | null;
  listing: PublicListingDetailResponse;
  sp: URLSearchParams;
  setSp: (next: URLSearchParams) => void;
  tz: string;
  i18n: I18n;
}) {
  const today = todayInTz(tz);
  const remaining = availability?.mode === 'inventory' ? availability.inventory.remaining : 0;
  const invCfg = (listing.modeConfig.inventory ?? {}) as { unit?: 'hour' | 'day' };
  const unit = invCfg.unit ?? 'day';

  const fromDate = (sp.get('from') || today).slice(0, 10);
  const toDate = (sp.get('to') || addDays(fromDate, 1)).slice(0, 10);
  const qty = Number(sp.get('qty') || '1');

  function update(patch: { from?: string; to?: string; qty?: number }): void {
    const next = new URLSearchParams(sp);
    next.set('mode', 'inventory');
    const nf = patch.from ?? fromDate;
    const nt = patch.to ?? toDate;
    const nq = String(patch.qty ?? qty);
    next.set('from', nf);
    next.set('to', nt);
    next.set('qty', nq);
    // Rental window: pickup at day start, return at end day start (unit=day) — the
    // API validates the exact window; times use the resource zone.
    next.set('start', zonedToUtcIso(nf, unit === 'day' ? '00:00' : '08:00', tz));
    next.set('end', zonedToUtcIso(nt, unit === 'day' ? '00:00' : '18:00', tz));
    setSp(next);
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5">
          <FieldLabel>{i18n.t('listing.checkin')}</FieldLabel>
          <input
            type="date"
            value={fromDate}
            min={today}
            onChange={(e) => e.target.value && update({ from: e.target.value })}
            className="h-10 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <FieldLabel>{i18n.t('listing.checkout')}</FieldLabel>
          <input
            type="date"
            value={toDate}
            min={addDays(fromDate, 1)}
            onChange={(e) => e.target.value && update({ to: e.target.value })}
            className="h-10 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs"
          />
        </label>
      </div>

      <div className="flex items-center justify-between">
        <FieldLabel>{i18n.t('listing.quantity')}</FieldLabel>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-8"
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
            className="size-8"
            disabled={qty >= remaining}
            onClick={() => update({ qty: Math.min(remaining, qty + 1) })}
          >
            +
          </Button>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">{i18n.t('listing.remaining', { count: remaining })}</p>
    </div>
  );
}

// ── Shared ───────────────────────────────────────────────────────────────────

function Breakdown({ quote, i18n }: { quote: QuoteResponse; i18n: I18n }) {
  return (
    <dl className="space-y-1.5 text-sm">
      {quote.lineItems.map((line, idx) => (
        <div key={idx} className="flex justify-between text-muted-foreground">
          <dt>
            {line.label}
            {line.block ? ` (${i18n.t('listing.package')})` : ''}
          </dt>
          <dd>{formatVnd(line.amount)}</dd>
        </div>
      ))}
      <Separator className="my-2" />
      <div className="flex justify-between font-semibold text-foreground">
        <dt>{i18n.t('listing.subtotal')}</dt>
        <dd>{formatVnd(quote.subtotal)}</dd>
      </div>
      <div className="flex justify-between text-muted-foreground">
        <dt>{i18n.t('listing.deposit')}</dt>
        <dd>{formatVnd(quote.depositAmount)}</dd>
      </div>
      {quote.securityDeposit !== '0' ? (
        <div className="flex justify-between text-muted-foreground">
          <dt>{i18n.t('listing.securityDeposit')}</dt>
          <dd>{formatVnd(quote.securityDeposit)}</dd>
        </div>
      ) : null}
    </dl>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{children}</span>;
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
