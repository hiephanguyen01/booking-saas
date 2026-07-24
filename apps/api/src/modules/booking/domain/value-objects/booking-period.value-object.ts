import { blockedPeriod, type TimeRange } from '../blocked-period';
import { BookingSlotInPast, InvalidBookingRange } from '../errors/booking-domain-errors';

/** Half-open booking interval plus its snapshotted, buffer-expanded exclusion key. */
export class BookingPeriod {
  private constructor(
    readonly timeslot: TimeRange,
    readonly blockedPeriod: TimeRange,
  ) {}

  static create(
    start: Date,
    end: Date,
    now: Date,
    bufferBeforeMin = 0,
    bufferAfterMin = 0,
  ): BookingPeriod {
    if (!(start < end)) throw new InvalidBookingRange();
    if (start < now) throw new BookingSlotInPast();
    const timeslot = { start, end };
    return new BookingPeriod(timeslot, blockedPeriod(timeslot, bufferBeforeMin, bufferAfterMin));
  }

  withBuffers(bufferBeforeMin: number, bufferAfterMin: number): BookingPeriod {
    return new BookingPeriod(
      this.timeslot,
      blockedPeriod(this.timeslot, bufferBeforeMin, bufferAfterMin),
    );
  }
}
