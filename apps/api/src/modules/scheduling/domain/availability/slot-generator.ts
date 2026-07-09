import { addMinutes } from '../../../../shared/time/time';
import { contains, overlapsAny, type Interval } from './interval';

/** A generated hourly start slot with its availability + price. */
export interface GeneratedSlot {
  startUtc: Date;
  endUtc: Date;
  available: boolean;
  price: string;
}

export interface HourlySlotInput {
  openWindows: readonly Interval[];
  /** Busy intervals by resource (bookings' blocked_period + holds; buffer already applied to bookings). */
  busy: readonly Interval[];
  now: Date;
  granularityMin: number;
  minDurationHours: number;
  bufferBeforeMin: number;
  bufferAfterMin: number;
  leadTimeMin: number;
  /** Price a `[start,end)` min-duration booking (wraps computeQuote). */
  priceAt: (startUtc: Date, endUtc: Date) => string;
}

/**
 * Generate hourly start slots on the granularity grid inside each open window
 * (§9.1). A start `s` is available when a min-duration booking fits the window,
 * is not sooner than `now + leadTime`, and — with buffers applied — overlaps no
 * busy interval. Busy checks are by resource (done by the caller).
 */
export function generateHourlySlots(input: HourlySlotInput): GeneratedSlot[] {
  const slotMs = input.minDurationHours * 60 * 60_000;
  const earliestStart = addMinutes(input.now, input.leadTimeMin);
  const slots: GeneratedSlot[] = [];

  for (const window of input.openWindows) {
    for (
      let s = window.start;
      s.getTime() + slotMs <= window.end.getTime();
      s = addMinutes(s, input.granularityMin)
    ) {
      const slot: Interval = { start: s, end: new Date(s.getTime() + slotMs) };
      if (!contains(window, slot)) continue;

      const occupied: Interval = {
        start: addMinutes(slot.start, -input.bufferBeforeMin),
        end: addMinutes(slot.end, input.bufferAfterMin),
      };
      const available = s >= earliestStart && !overlapsAny(occupied, input.busy);

      slots.push({
        startUtc: slot.start,
        endUtc: slot.end,
        available,
        price: input.priceAt(slot.start, slot.end),
      });
    }
  }
  return slots;
}
