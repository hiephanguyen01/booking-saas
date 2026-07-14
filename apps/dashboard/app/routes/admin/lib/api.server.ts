import { redirect } from 'react-router';
import { requirePermission, requireScope, type AuthContext } from '~/lib/auth.server';
import type { ApiAuth, RefreshedTokens } from '~/lib/api.server';
import { commitSession, getSession } from '~/lib/session.server';
import { normalizedRequestLocation } from '~/lib/navigation.server';

/**
 * Platform-admin request context. Guards the platform scope (optionally a
 * specific permission), and hands back an `ApiAuth` wired for silent token
 * refresh. Platform reads are cross-tenant and hit the API's BYPASSRLS admin
 * pool, so no `x-tenant-id` header is set. Call `refreshedCookie()` at the end of
 * a loader/action to persist rotated tokens.
 */
export interface PlatformSession {
  ctx: AuthContext;
  auth: ApiAuth;
  /** Set-Cookie value when the access token was silently rotated, else null. */
  refreshedCookie: () => Promise<string | null>;
}

export async function platformSession(
  request: Request,
  permission?: string,
): Promise<PlatformSession> {
  const ctx = permission
    ? await requirePermission(request, permission)
    : await requireScope(request, 'platform');

  let rotated: RefreshedTokens | null = null;
  const auth: ApiAuth = {
    token: ctx.user.accessToken,
    refreshToken: ctx.user.refreshToken,
    onRefreshed: (tokens) => {
      rotated = tokens;
    },
  };

  const refreshedCookie = async (): Promise<string | null> => {
    if (!rotated) return null;
    const session = await getSession(request.headers.get('Cookie'));
    session.set('accessToken', rotated.accessToken);
    session.set('refreshToken', rotated.refreshToken);
    return commitSession(session);
  };

  return { ctx, auth, refreshedCookie };
}

/**
 * Loader helper: guard, run the fetch work, then replay the request with a fresh
 * cookie if the token rotated mid-flight (so the loader re-runs cleanly).
 */
export async function platformLoader<T>(
  request: Request,
  work: (auth: ApiAuth, ctx: AuthContext) => Promise<T>,
  permission?: string,
): Promise<T> {
  const { ctx, auth, refreshedCookie } = await platformSession(request, permission);
  const result = await work(auth, ctx);
  const cookie = await refreshedCookie();
  if (cookie) {
    throw redirect(normalizedRequestLocation(request), {
      headers: { 'Set-Cookie': cookie },
    });
  }
  return result;
}
