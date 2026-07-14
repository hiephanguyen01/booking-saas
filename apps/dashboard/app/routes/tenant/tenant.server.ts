import type { ScopeMembership } from '@booking/contracts';
import type { ApiAuth } from '~/lib/api.server';
import { requirePermission, requireScope, type AuthContext } from '~/lib/auth.server';

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

function tenantForbidden(): Response {
  return new Response('Không tìm thấy tenant cho tài khoản này.', { status: 403 });
}

/**
 * Guards a tenant route. Pass a `permission` key to require it (deny-by-default,
 * mirrors the backend guard); omit it to only require tenant-scope membership.
 */
export async function requireTenant(request: Request, permission?: string): Promise<TenantContext> {
  const ctx = permission
    ? await requirePermission(request, permission)
    : await requireScope(request, 'tenant');

  const membership = ctx.info.scopes.find((scope) => scope.scope === 'tenant');
  if (!membership || !membership.tenantId) throw tenantForbidden();

  const tenantId = membership.tenantId;
  return {
    ctx,
    membership,
    tenantId,
    auth: { token: ctx.user.accessToken, tenantId },
    can: (key) => membership.permissions.includes(key),
  };
}
