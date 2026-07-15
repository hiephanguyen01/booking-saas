import type { HourlySlot } from '@booking/contracts';
import type { Locale } from '@booking/i18n';
import { storefrontPaths } from '../../lib/locale-paths';

type SlotRange = Pick<HourlySlot, 'startUtc' | 'endUtc'>;

export interface SlotSelectionResult {
  slots: HourlySlot[];
  changed: boolean;
}

export function sortSlots<T extends SlotRange>(slots: T[]): T[] {
  return [...slots].sort((left, right) => left.startUtc.localeCompare(right.startUtc));
}

/**
 * Availability exposes every valid duration from a start time. The Figma picker
 * is hour-cell based, so keep only the smallest duration returned by the API.
 */
export function atomicHourlySlots(slots: HourlySlot[]): HourlySlot[] {
  let shortest = Number.POSITIVE_INFINITY;
  for (const slot of slots) {
    const duration = Date.parse(slot.endUtc) - Date.parse(slot.startUtc);
    if (duration > 0 && duration < shortest) shortest = duration;
  }
  if (!Number.isFinite(shortest)) return [];

  const seen = new Set<string>();
  return sortSlots(slots).filter((slot) => {
    const key = `${slot.startUtc}:${slot.endUtc}`;
    const matches = Date.parse(slot.endUtc) - Date.parse(slot.startUtc) === shortest;
    if (!matches || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Keeps an hourly booking representable by the current API's single from/to interval.
 * Users may extend either edge of the range and remove either edge, but cannot create gaps.
 */
export function toggleContiguousSlot(
  selected: HourlySlot[],
  candidate: HourlySlot,
): SlotSelectionResult {
  const ordered = sortSlots(selected);
  const index = ordered.findIndex((slot) => slot.startUtc === candidate.startUtc);

  if (index >= 0) {
    if (ordered.length === 1 || index === 0 || index === ordered.length - 1) {
      return { slots: ordered.filter((_, slotIndex) => slotIndex !== index), changed: true };
    }
    return { slots: ordered, changed: false };
  }

  if (ordered.length === 0) return { slots: [candidate], changed: true };

  const first = ordered[0];
  const last = ordered[ordered.length - 1];
  if (candidate.endUtc === first.startUtc || candidate.startUtc === last.endUtc) {
    return { slots: sortSlots([...ordered, candidate]), changed: true };
  }

  return { slots: ordered, changed: false };
}

export function slotInterval(slots: SlotRange[]): { start: string; end: string } | null {
  if (slots.length === 0) return null;
  const ordered = sortSlots(slots);
  return { start: ordered[0].startUtc, end: ordered[ordered.length - 1].endUtc };
}

export function checkoutHref(input: {
  locale: Locale;
  listingSlug: string;
  mode: 'hourly' | 'daily';
  start: string;
  end: string;
}): string {
  const params = new URLSearchParams({
    listing: input.listingSlug,
    mode: input.mode,
    start: input.start,
    end: input.end,
  });
  return `${storefrontPaths.checkout(input.locale)}?${params.toString()}`;
}

export type RoomAvailabilityState = 'available' | 'booked' | 'missing-price';

export function roomAvailabilityState(input: {
  available: boolean;
  price: string | null;
}): RoomAvailabilityState {
  if (!input.available) return 'booked';
  return input.price ? 'available' : 'missing-price';
}
