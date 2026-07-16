import { formatVnd } from '../../lib/ui';
import type { RoomOption } from './listing-group-types';

/**
 * A room attribute ready to render. Area carries its raw number so the unit
 * sentence stays in the `listing` namespace; every other attribute is
 * tenant-authored (its key comes from the listing type's attribute schema) and
 * has no translation to look up.
 */
export type RoomAttribute =
  | { kind: 'area'; key: string; value: number }
  | { kind: 'text'; key: string; label: string };

/** The lowest quoted price across the bookable rooms, formatted, or null. */
export function minimumRoomPrice(options: RoomOption[]): string | null {
  let minimum: number | null = null;
  for (const option of options) {
    const value = Number(option.price);
    if (Number.isFinite(value) && value >= 0 && (minimum === null || value < minimum))
      minimum = value;
  }
  return minimum === null ? null : formatVnd(String(minimum));
}

export function roomCapacity(attributes: Record<string, unknown>): number | null {
  for (const key of ['capacity', 'maxGuests', 'guestCapacity', 'sucChua']) {
    const value = Number(attributes[key]);
    if (Number.isFinite(value) && value > 0) return value;
  }
  return null;
}

/** Capacity is rendered on its own, so it is filtered out here. */
export function roomAttributes(attributes: Record<string, unknown>): RoomAttribute[] {
  return Object.entries(attributes)
    .flatMap<RoomAttribute>(([key, value]) => {
      if (typeof value === 'boolean' || value === null || value === undefined || value === '')
        return [];
      if (/capacity|guest|succhua/i.test(key)) return [];
      if (typeof value === 'number' && /area|dientich/i.test(key))
        return [{ kind: 'area', key, value }];
      if (typeof value === 'string' || typeof value === 'number')
        return [{ kind: 'text', key, label: `${humanizeKey(key)}: ${String(value)}` }];
      return [];
    })
    .slice(0, 5);
}

export function humanizeKey(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/^./, (letter) => letter.toUpperCase());
}
