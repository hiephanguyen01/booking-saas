/**
 * Token utilities — framework-agnostic.
 *
 * Contains JWT decode helpers, token storage interfaces, and cookie-based
 * token extraction patterns. Does NOT import react-router, express, or NestJS.
 *
 * Each app is responsible for wiring these into its own session management:
 *   - dashboard: apps/dashboard/app/lib/auth.server.ts
 *   - storefront: apps/storefront/app/lib/auth.server.ts (if auth needed)
 */

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/** Decode the payload of a JWT (without verification — server-side use only). */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const [, payload] = token.split('.');
    if (!payload) return null;
    const padded = payload.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = atob(padded);
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Returns true if the token's `exp` claim is in the past (with optional buffer in seconds). */
export function isTokenExpired(token: string, bufferSeconds = 30): boolean {
  const payload = decodeJwtPayload(token);
  if (!payload || typeof payload.exp !== 'number') return true;
  return payload.exp < Date.now() / 1000 + bufferSeconds;
}

/** Extract the `sub` claim from a JWT payload, or null. */
export function getTokenSubject(token: string): string | null {
  const payload = decodeJwtPayload(token);
  return typeof payload?.sub === 'string' ? payload.sub : null;
}
