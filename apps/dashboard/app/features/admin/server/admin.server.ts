import type { ScopeMembership } from '@booking/contracts';
import { requirePermission, requireScope, type AuthContext } from '~/lib/auth.server';
import type { ApiAuth } from '~/lib/api.server';
import { getCurrentDashboardHost } from '~/lib/request-auth.server';

/**
 * Resolved platform-admin request context for a loader/action. Mirrors the
 * tenant/partner guards' contract: every area guard returns
 * `{ ctx, membership, auth, can }`.
 */
export interface PlatformContext {
  ctx: AuthContext;
  /** The platform scope membership (roles, permissions). */
  membership: ScopeMembership;
  /** api.server auth descriptor (platform calls carry no tenant scope header). */
  auth: ApiAuth;
  /** UI gate — true when the signed-in user holds `permission` in the platform scope. */
  can: (permission: string) => boolean;
}

/**
 * Guards a platform-admin route. Pass a `permission` key to require it
 * (deny-by-default, mirrors `requireTenant`/`requirePartner`); omit it to only
 * require platform-scope membership.
 */
export async function requirePlatform(
  request: Request,
  permission?: string,
): Promise<PlatformContext> {
  if (getCurrentDashboardHost().kind !== 'platform') {
    throw new Response('Không tìm thấy trang.', { status: 404 });
  }
  const ctx = permission
    ? await requirePermission(request, permission)
    : await requireScope(request, 'platform');
  const membership = ctx.info.scopes.find((m) => m.scope === 'platform');
  if (!membership) {
    throw new Response('Bạn không có quyền truy cập (platform).', { status: 403 });
  }
  return {
    ctx,
    membership,
    auth: { token: ctx.user.accessToken },
    can: (key) => membership.permissions.includes(key),
  };
}
