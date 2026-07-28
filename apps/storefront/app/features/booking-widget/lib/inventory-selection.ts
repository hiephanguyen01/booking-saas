import { addDays, zonedToUtcIso } from '~/lib/time';

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
export function inventoryWindow(
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
