/**
 * Which booking modes the scheduling widget can actually drive.
 *
 * `listing_type.booking_modes` also carries `appointment`, `class` and
 * `inventory`; only the two time-grid modes below have a calendar/slot UI. This
 * is the schema field the listing page branches on — never the listing-type slug
 * or the tenant vertical (see `docs/conventions.md`).
 */
export type ScheduledBookingMode = 'hourly' | 'daily';

export function isScheduledBookingMode(mode: string): mode is ScheduledBookingMode {
  return mode === 'hourly' || mode === 'daily';
}

export function scheduledBookingModes(modes: readonly string[]): ScheduledBookingMode[] {
  return modes.filter(isScheduledBookingMode);
}

/** Whether this listing can be booked through the scheduling dialog at all. */
export function supportsScheduledBooking(modes: readonly string[]): boolean {
  return modes.some(isScheduledBookingMode);
}
