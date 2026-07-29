import { formatVnd } from '~/lib/ui';
import type { RoomOption } from './listing-group-types';

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
