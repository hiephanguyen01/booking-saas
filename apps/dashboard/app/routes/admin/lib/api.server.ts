import { requirePermission, requireScope, type AuthContext } from '~/lib/auth.server';
import type { ApiAuth } from '~/lib/api.server';

export interface PlatformSession {
  ctx: AuthContext;
  auth: ApiAuth;
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
