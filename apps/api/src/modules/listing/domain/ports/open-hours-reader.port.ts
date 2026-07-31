import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type { DateException, WeeklyRule } from '../../../../shared/domain/availability/open-windows';

export const OPEN_HOURS_READER = Symbol('OPEN_HOURS_READER');

/** A listing's opening hours for one calendar date, before they are resolved. */
export interface OpenHoursForDate {
  /** The listing's weekly rules for the date's weekday. */
  rules: WeeklyRule[];
  /** The resource's override for that exact date, if any. */
  exception: DateException | null;
}

/**
 * Reads the opening hours that constrain an hourly pricing window.
 *
 * The hours themselves are the scheduling context's data, but scheduling
 * already imports this module, so injecting its repositories back here would
 * close a module cycle (`pnpm check:module-cycles`). This port keeps the read
 * local; the *interpretation* of the rows is not duplicated — both sides go
 * through `shared/domain/availability/open-windows`.
 */
export interface IOpenHoursReader {
  forDate(
    tx: PrismaTx,
    listingId: string,
    resourceId: string,
    date: string,
  ): Promise<OpenHoursForDate>;
}
