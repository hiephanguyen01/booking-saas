import { addMinutes } from '../../../../shared/time/time';
import { contains, overlapsAny, type Interval } from './interval';

/** A generated hourly slot (a `(start, duration)` pair) with its availability + price. */
export interface GeneratedSlot {
  startUtc: Date;
  endUtc: Date;
  available: boolean;
  price: string;
}

export interface HourlySlotInput {
  openWindows: readonly Interval[];
  /**
   * Booking-derived busy intervals by resource (bookings' buffered `blocked_period`).
   * Holds are NOT included here — they are merged live via {@link applyLiveHolds}
   * so this result can be cached (§9.1: hold state is never cached).
   */
  busy: readonly Interval[];
  now: Date;
  granularityMin: number;
  minDurationHours: number;
  /** Longest bookable duration (§9.1 step 3); durations step by `granularityMin`. */
  maxDurationHours: number;
  bufferBeforeMin: number;
  bufferAfterMin: number;
  leadTimeMin: number;
  /** Price a `[start,end)` booking of the given duration (wraps computeQuote). */
  priceAt: (startUtc: Date, endUtc: Date) => string;
}

/**
 * Generate hourly slots on the granularity grid inside each open window (§9.1
 * step 3). For every start `s` on the grid and every duration `d` from
 * `minDuration` to `maxDuration` (stepping by `granularity`), emit a slot for
 * `[s, s+d)` when it fits the window. A slot is available when it starts no
 * sooner than `now + leadTime` and — with buffers applied — overlaps no busy
 * interval. Flexible listings iterate their valid range; fixed-package callers
 * pass the selected package duration as both min and max. Busy checks are by resource
 * (done by the caller). Holds are merged separately via {@link applyLiveHolds}.
 */
export function generateHourlySlots(input: HourlySlotInput): GeneratedSlot[] {
  const minMs = input.minDurationHours * 60 * 60_000;
  const maxMs = input.maxDurationHours * 60 * 60_000;
  const stepMs = input.granularityMin * 60_000;
  const earliestStart = addMinutes(input.now, input.leadTimeMin);
  const slots: GeneratedSlot[] = [];

  for (const window of input.openWindows) {
    for (
      let s = window.start;
      s.getTime() + minMs <= window.end.getTime();
      s = addMinutes(s, input.granularityMin)
    ) {
      for (let durMs = minMs; durMs <= maxMs; durMs += stepMs) {
        const slot: Interval = { start: s, end: new Date(s.getTime() + durMs) };
        // Durations grow monotonically → once one overruns the window, all longer
        // ones do too, so stop extending this start.
        if (!contains(window, slot)) break;

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
  }
  return slots;
}

export interface LiveHoldsInput {
  bufferBeforeMin: number;
  bufferAfterMin: number;
  /** Live, expiry-filtered holds for the resource (read from Redis, never cached). */
  holds: readonly Interval[];
}

/**
 * Merge live holds into already-generated (possibly cached) slots at read time
 * (§9.1: "hold state is never cached — merged at read time"). A hold can only
 * make an available slot busy, never the reverse, so a hold that has naturally
 * expired in Redis simply isn't present here and never leaves a ghost-busy slot.
 */
export function applyLiveHolds(
  slots: readonly GeneratedSlot[],
  input: LiveHoldsInput,
): GeneratedSlot[] {
  if (input.holds.length === 0) return slots as GeneratedSlot[];
  return slots.map((slot) => {
    if (!slot.available) return slot;
    const occupied: Interval = {
      start: addMinutes(slot.startUtc, -input.bufferBeforeMin),
      end: addMinutes(slot.endUtc, input.bufferAfterMin),
    };
    return overlapsAny(occupied, input.holds) ? { ...slot, available: false } : slot;
  });
}
