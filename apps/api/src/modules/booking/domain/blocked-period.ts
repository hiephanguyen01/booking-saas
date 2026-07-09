import { addMinutes } from '../../../shared/time/time';

export interface TimeRange {
  start: Date;
  end: Date;
}

/**
 * The exclusion-constraint key (§10): the timeslot expanded by the buffer,
 * snapshotted at booking time so a later change to the listing's buffer never
 * affects existing bookings.
 */
export function blockedPeriod(
  timeslot: TimeRange,
  bufferBeforeMin: number,
  bufferAfterMin: number,
): TimeRange {
  return {
    start: addMinutes(timeslot.start, -bufferBeforeMin),
    end: addMinutes(timeslot.end, bufferAfterMin),
  };
}
