import type { Response } from 'express';
import type { SessionTokens } from '../../domain/ports/session-store.port';
import { ACCESS_COOKIE } from '../../../../shared/http/cookie-names';

/**
 * Canonical definition moved to `shared/http/cookie-names.ts` — `AuthenticatedOnly` (also
 * `shared/http/`) needs the cookie name and `shared/` must never import from `modules/`.
 * Re-exported here so every existing importer of `ACCESS_COOKIE` from this path keeps working
 * untouched. Do not delete this re-export: it is what keeps the module-cycle guard green.
 */
export { ACCESS_COOKIE };
export const REFRESH_COOKIE = 'rid';

const secure = () => process.env.SESSION_COOKIE_SECURE !== 'false';

export function setSessionCookies(res: Response, tokens: SessionTokens): void {
  res.cookie(ACCESS_COOKIE, tokens.accessToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: secure(),
    expires: tokens.refreshExpiresAt, // cookie outlives the access TTL; the DB decides validity
    path: '/',
  });
  res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: secure(),
    expires: tokens.refreshExpiresAt,
    path: '/auth', // only ever sent to the auth endpoints
  });
}

export function clearSessionCookies(res: Response): void {
  res.clearCookie(ACCESS_COOKIE, { path: '/' });
  res.clearCookie(REFRESH_COOKIE, { path: '/auth' });
}
