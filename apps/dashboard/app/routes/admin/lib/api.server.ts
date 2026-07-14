import { requirePermission, requireScope, type AuthContext } from '~/lib/auth.server';
import type { ApiAuth } from '~/lib/api.server';

export interface PlatformSession {
  ctx: AuthContext;
  auth: ApiAuth;
  /** @deprecated Refresh is owned by the root middleware. */
  refreshedCookie: () => Promise<null>;
}

export async function platformSession(
  request: Request,
  permission?: string,
): Promise<PlatformSession> {
  const ctx = permission
    ? await requirePermission(request, permission)
    : await requireScope(request, 'platform');

  return {
    ctx,
    auth: { token: ctx.user.accessToken },
    refreshedCookie: async () => null,
  };
}

export async function platformLoader<T>(
  request: Request,
  work: (auth: ApiAuth, ctx: AuthContext) => Promise<T>,
  permission?: string,
): Promise<T> {
  const { ctx, auth } = await platformSession(request, permission);
  return work(auth, ctx);
}
