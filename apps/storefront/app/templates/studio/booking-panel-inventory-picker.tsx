import type { AvailabilityResponse } from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import { Input } from '@booking/ui/components/ui/input';
import { NsI18n, useTranslation } from '~/lib/i18n';
import { addDays, zonedToUtcIso } from '~/lib/time';
import { PickerLabel } from './booking-panel-presentation';
import type { SetSearchParams } from './booking-panel-types';

export interface InventorySelection {
  from: string;
  to: string;
  qty: number;
  unit: 'hour' | 'day';
  start: string;
  end: string;
}

/** Rental window: pickup at day start, return at end day start (unit=day) — the
 * API validates the exact window; times use the resource zone. */
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

export function getInventorySelection(
  sp: URLSearchParams,
  modeConfig: Record<string, unknown>,
  tz: string,
  today: string,
): InventorySelection {
  const unit = ((modeConfig.inventory ?? {}) as { unit?: 'hour' | 'day' }).unit ?? 'day';
  const from = (sp.get('from') || today).slice(0, 10);
  const to = (sp.get('to') || addDays(from, 1)).slice(0, 10);
  const parsedQty = Number(sp.get('qty') || sp.get('quantity') || '1');
  const qty = Number.isFinite(parsedQty) && parsedQty >= 1 ? Math.floor(parsedQty) : 1;
  return { from, to, qty, unit, ...inventoryWindow(from, to, unit, tz) };
}

export function InventoryPicker({
  availability,
  selection,
  sp,
  setSp,
  tz,
  today,
}: {
  availability: AvailabilityResponse | null;
  selection: InventorySelection;
  sp: URLSearchParams;
  setSp: SetSearchParams;
  tz: string;
  today: string;
}) {
  const { t } = useTranslation(NsI18n.Listing);
  const remaining = availability?.mode === 'inventory' ? availability.inventory.remaining : 0;
  const { from: fromDate, to: toDate, qty, unit } = selection;

  function update(patch: { from?: string; to?: string; qty?: number }): void {
    const next = new URLSearchParams(sp);
    const nextFrom = patch.from ?? fromDate;
    const nextTo = patch.to ?? toDate;
    const window = inventoryWindow(nextFrom, nextTo, unit, tz);
    next.set('mode', 'inventory');
    next.set('from', nextFrom);
    next.set('to', nextTo);
    next.set('qty', String(patch.qty ?? qty));
    next.set('start', window.start);
    next.set('end', window.end);
    setSp(next, { preventScrollReset: true });
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
            onChange={(event) => event.target.value && update({ from: event.target.value })}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <PickerLabel>{t('checkout')}</PickerLabel>
          <Input
            type="date"
            value={toDate}
            min={addDays(fromDate, 1)}
            onChange={(event) => event.target.value && update({ to: event.target.value })}
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
