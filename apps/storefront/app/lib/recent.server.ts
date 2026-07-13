/**
 * "My bookings" for guests without an account (§8.6): a plain cookie of recent
 * booking codes created on this device. Codes alone are not sensitive — viewing
 * a booking's details still requires the email OTP (§8.6) — so no signing is
 * needed. Newest first, capped.
 */
const COOKIE = 'sf_recent';
const MAX = 10;

export function readRecentCodes(request: Request): string[] {
  const match = (request.headers.get('cookie') ?? '').match(/(?:^|;\s*)sf_recent=([^;]+)/);
  if (!match) return [];
  try {
    return decodeURIComponent(match[1])
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean)
      .slice(0, MAX);
  } catch {
    return [];
  }
}

/** `Set-Cookie` value that prepends `code` to the recent list (deduped, capped). */
export function appendRecentCookie(request: Request, code: string): string {
  const next = [code, ...readRecentCodes(request).filter((c) => c !== code)].slice(0, MAX);
  const value = encodeURIComponent(next.join(','));
  return `${COOKIE}=${value}; Path=/; Max-Age=15552000; SameSite=Lax`;
}
