/**
 * No-show window (TONG-QUAN.md §8.5): the partner may mark a confirmed booking
 * `no_show` only AFTER the slot has ended and only WITHIN 48h of `timeslot.end`.
 * Past that window a scheduled job auto-transitions the booking to `completed`,
 * so a late manual no-show would race that job and record commission on the wrong
 * basis. Pure + framework-free so the boundary is fully unit-testable.
 */
export const NO_SHOW_WINDOW_HOURS = 48;

const NO_SHOW_WINDOW_MS = NO_SHOW_WINDOW_HOURS * 3_600_000;

/** True when `now` falls strictly after `timeslotEnd` and within the 48h window. */
export function isWithinNoShowWindow(timeslotEnd: Date, now: Date): boolean {
  const end = timeslotEnd.getTime();
  const at = now.getTime();
  // The slot must have finished (a no-show is only meaningful post-usage)…
  if (at <= end) return false;
  // …and the 48h dispute/marking window must not have elapsed.
  return at <= end + NO_SHOW_WINDOW_MS;
}
