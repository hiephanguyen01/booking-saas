import { createCookie } from 'react-router';
import { storefrontEnv } from './env.server';

/**
 * "My bookings" for guests without an account (§8.6): a signed, httpOnly cookie
 * containing recent booking codes created on this device. Viewing details still
 * requires the email OTP, but signing prevents arbitrary links from being
 * injected into the recent-bookings UI.
 */
const MAX = 10;
const MAX_AGE_SECONDS = 60 * 60 * 24 * 180;
const BOOKING_CODE_RE = /^BK-[A-HJ-NP-Z2-9]{6}$/;

const recentCookie = createCookie('sf_recent', {
  httpOnly: true,
  path: '/',
  sameSite: 'lax',
  secure: storefrontEnv.secureCookies,
  secrets: [...storefrontEnv.sessionSecrets],
  maxAge: MAX_AGE_SECONDS,
});

function validCodes(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value)]
    .filter((item): item is string => typeof item === 'string' && BOOKING_CODE_RE.test(item))
    .slice(0, MAX);
}

export async function readRecentCodes(request: Request): Promise<string[]> {
  const value: unknown = await recentCookie.parse(request.headers.get('Cookie'));
  return validCodes(value);
}

/** `Set-Cookie` value that prepends `code` to the recent list (deduped, capped). */
export async function appendRecentCookie(request: Request, code: string): Promise<string> {
  const current = await readRecentCodes(request);
  const next = validCodes([code, ...current.filter((item) => item !== code)]);
  return recentCookie.serialize(next);
}
