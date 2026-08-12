import { redirect } from 'react-router';
import type { ScopeMembership } from '@booking/contracts';
import type { ApiAuth } from '~/lib/api.server';
import { getOptionalUser, requireScope, type AuthContext } from '~/lib/auth.server';
import { getCurrentDashboardHost, getCurrentHostTenant } from '~/lib/request-auth.server';
import { tenantMembership } from '~/lib/workspace';
import { dashboardPaths } from '~/constants/paths';

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
 *
 * This area lives only on a tenant console host, checked here — not just in
 * `_layout.tsx` — because every child route calls this too, and React Router
 * runs the parent and child loaders in the same pass: a redirect thrown by
 * either wins over a plain 404 thrown by the other. With the check only in the
 * layout, a child route's own (host-blind) auth redirect to `/auth/login` beat
 * the layout's 404 for an anonymous caller on the platform host. Checking it
 * here first means every caller of `requireTenant` agrees on the outcome
 * before any of them reach the auth check below, so there is no redirect left
 * to race against. Mirrors `requirePlatform`
 * (`features/admin/server/admin.server.ts`), which checks host before auth for
 * the same reason.
 */
export async function requireTenant(request: Request, permission?: string): Promise<TenantContext> {
  if (getCurrentDashboardHost().kind === 'platform') {
    throw (await getOptionalUser(request))
      ? redirect(dashboardPaths.workspaces)
      : new Response('Không tìm thấy trang.', { status: 404 });
  }
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
