import type { ScopeMembership } from '@booking/contracts';
import type { ApiAuth } from '~/lib/api.server';
import { requireScope, type AuthContext } from '~/lib/auth.server';
import { getCurrentHostTenant } from '~/lib/request-auth.server';
import { tenantMembership } from '~/lib/workspace';

/**
 * Resolved tenant request context for a loader/action. The access token has just
 * been validated by {@link requireScope}/{@link requirePermission} (which silently
 * refreshes + replays on expiry), so `auth` replays it directly to the API with
 * the `x-tenant-id` scope header the backend PermissionsGuard requires.
 */
export interface TenantContext {
  ctx: AuthContext;
  membership: ScopeMembership;
  tenantId: string;
  /** Ready-to-use API auth: bearer token value + tenant scope header. */
  auth: ApiAuth;
  /** UI gate — true when the signed-in user holds `permission` in the tenant scope. */
  can: (permission: string) => boolean;
}

/**
 * Guards a tenant route. Pass a `permission` key to require it (deny-by-default,
 * mirrors the backend guard); omit it to only require tenant-scope membership.
 */
export async function requireTenant(request: Request, permission?: string): Promise<TenantContext> {
  const ctx = await requireScope(request, 'tenant');
  // The host names the tenant; the session proves the caller may act in it. Never
  // the first membership — that is what limited a multi-tenant operator to one.
  const hostTenant = getCurrentHostTenant();
  const membership = tenantMembership(ctx.info, hostTenant.id);
  if (!membership) {
    throw new Response(`Tài khoản này không có quyền tại ${hostTenant.name}.`, { status: 403 });
  }
  const tenantId = hostTenant.id;
  if (permission && !membership.permissions.includes(permission)) {
    throw new Response(`Bạn không có quyền truy cập (${permission}).`, { status: 403 });
  }

  return {
    ctx,
    membership,
    tenantId,
    auth: { token: ctx.user.accessToken, tenantId },
    can: (key) => membership.permissions.includes(key),
  };
}
