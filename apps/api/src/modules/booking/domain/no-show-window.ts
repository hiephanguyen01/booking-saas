/**
 * The two clocks that run after `timeslot.end` (TONG-QUAN.md §8.5).
 *
 * The partner may mark a confirmed booking `no_show` only AFTER the slot has
 * ended and only WITHIN {@link NO_SHOW_WINDOW_HOURS} of `timeslot.end`. Once
 * {@link AUTO_COMPLETE_GRACE_HOURS} have passed a scheduled sweep transitions
 * the booking to `completed` itself, so the settlement's dispute window opens
 * even when the partner never touches the booking — otherwise the customer
 * could never file a claim and the money would sit in custody forever.
 *
 * The two are deliberately one hour apart, and the auto-complete deadline is
 * derived from the no-show window so they can never drift. That hour is a guard
 * band: a no-show marked at 22h59 must not race the sweep and lose to a
 * `completed` transition that recognises revenue on the wrong basis. Inside the
 * band the partner can still complete manually, but no longer mark no-show.
 *
 * Pure + framework-free so the boundary stays trivially reviewable.
 */
export const NO_SHOW_WINDOW_HOURS = 23;

/** One hour after the no-show window shuts — see the guard-band note above. */
export const AUTO_COMPLETE_GRACE_HOURS = NO_SHOW_WINDOW_HOURS + 1;

const HOUR_MS = 3_600_000;
const NO_SHOW_WINDOW_MS = NO_SHOW_WINDOW_HOURS * HOUR_MS;
const AUTO_COMPLETE_GRACE_MS = AUTO_COMPLETE_GRACE_HOURS * HOUR_MS;

/** True when `now` falls strictly after `timeslotEnd` and within the no-show window. */
export function isWithinNoShowWindow(timeslotEnd: Date, now: Date): boolean {
  const end = timeslotEnd.getTime();
  const at = now.getTime();
  // The slot must have finished (a no-show is only meaningful post-usage)…
  if (at <= end) return false;
  // …and the marking window must not have elapsed.
  return at <= end + NO_SHOW_WINDOW_MS;
}

/** True once the partner's grace period has fully elapsed. */
export function isAutoCompleteDue(timeslotEnd: Date, now: Date): boolean {
  return now.getTime() >= timeslotEnd.getTime() + AUTO_COMPLETE_GRACE_MS;
}
