import type { AvailabilityResponse } from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import { Input } from '@booking/ui/components/ui/input';
import type { InventorySelection } from '~/features/booking-widget/lib/inventory-selection';
import { inventoryWindow } from '~/features/booking-widget/lib/inventory-selection';
import type { SetSearchParams } from '~/features/booking-widget/lib/booking-panel-types';
import { NsI18n, useTranslation } from '@booking/i18n';
import { addDays } from '~/lib/time';
import { PickerLabel } from './booking-panel-presentation';

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
