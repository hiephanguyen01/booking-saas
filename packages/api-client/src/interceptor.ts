/**
 * Token refresh interceptor.
 *
 * Handles the 401 silent-refresh pattern: on an expired access token the
 * interceptor transparently calls POST /auth/refresh (using the stored refresh
 * token), rotates the tokens, notifies the caller via `onRefreshed`, then
 * retries the original request once.
 *
 * This module is pure Node.js `fetch` — no framework imports.
 */

import type { ApiAuth, RefreshedTokens } from './types';

/** Extract cookie name→value pairs from a fetch Response's Set-Cookie headers. */
export function parseSetCookies(res: Response): Record<string, string> {
  const out: Record<string, string> = {};
  const list = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
  for (const raw of list) {
    const [pair] = raw.split(';');
    if (!pair) continue;
    const idx = pair.indexOf('=');
    if (idx > -1) out[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
  }
  return out;
}

/** POST /auth/refresh with the stored refresh token; returns rotated tokens or null. */
export async function refreshTokens(
  backendUrl: string,
  refreshToken: string,
): Promise<RefreshedTokens | null> {
  let res: Response;
  try {
    res = await fetch(`${backendUrl}/auth/refresh`, {
      method: 'POST',
      headers: { accept: 'application/json', cookie: `rid=${refreshToken}` },
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const cookies = parseSetCookies(res);
  if (!cookies.sid || !cookies.rid) return null;
  return { accessToken: cookies.sid, refreshToken: cookies.rid };
}

export function normalizeAuth(auth: string | ApiAuth): ApiAuth {
  return typeof auth === 'string' ? { token: auth } : auth;
}

export function scopeHeaders(auth: ApiAuth): Record<string, string> {
  const headers: Record<string, string> = {};
  if (auth.tenantId) headers['x-tenant-id'] = auth.tenantId;
  if (auth.partnerId) headers['x-partner-id'] = auth.partnerId;
  return headers;
}
