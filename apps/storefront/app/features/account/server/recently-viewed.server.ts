import {
  parseViewedRefKey,
  viewedRefKey,
  VIEWED_REF_KEY_RE,
  type ViewedRef,
} from '~/features/account/lib/recently-viewed-ref';
import { signedCookie } from '~/lib/server/signed-cookie.server';

/**
 * "Đã xem gần đây" (account menu): the listing and studio detail pages this
 * device has opened, newest first, in a signed httpOnly cookie.
 *
 * Deliberately separate from `recent.server.ts`, which holds guest *booking
 * codes* for "my bookings on this device" — a different lifetime, a different
 * consumer, and a value that must never be mixed with browsing history.
 *
 * Per-device, not per-account: the account page that reads this requires a
 * session, so logout clears the cookie (`logoutAction`) to stop one customer's
 * browsing from greeting the next person to sign in on a shared browser.
 */
const MAX = 12;
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

const viewedCookie = signedCookie('sf_viewed', MAX_AGE_SECONDS);

/**
 * The cookie is signed, but its payload is still parsed defensively — the same
 * posture `validCodes()` takes next door. A secret rotation, a hand-edited
 * value or a change to the slug format must degrade to "no history", never let
 * a malformed key reach an API path builder.
 */
function validKeys(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value)]
    .filter((item): item is string => typeof item === 'string' && VIEWED_REF_KEY_RE.test(item))
    .slice(0, MAX);
}

export async function readViewedKeys(request: Request): Promise<string[]> {
  const value: unknown = await viewedCookie.parse(request.headers.get('Cookie'));
  return validKeys(value);
}

export async function readViewedRefs(request: Request): Promise<ViewedRef[]> {
  return (await readViewedKeys(request))
    .map(parseViewedRefKey)
    .filter((ref): ref is ViewedRef => ref !== null);
}

/**
 * `Set-Cookie` that moves `ref` to the front of the list, or `null` when it is
 * already there — refreshing a listing page then costs no header and cannot
 * reorder the list.
 */
export async function appendViewedCookie(
  request: Request,
  ref: ViewedRef,
): Promise<string | null> {
  const key = viewedRefKey(ref);
  if (!VIEWED_REF_KEY_RE.test(key)) return null;

  const current = await readViewedKeys(request);
  if (current[0] === key) return null;

  return writeViewedCookie([key, ...current.filter((item) => item !== key)]);
}

export function writeViewedCookie(keys: readonly string[]): Promise<string> {
  return viewedCookie.serialize(validKeys([...keys]));
}

/** Expires the cookie — the clear-all action and logout. */
export function clearViewedCookie(): Promise<string> {
  return viewedCookie.serialize([], { maxAge: 0 });
}
