import { redirect } from 'react-router';
import type { ScopeMembership } from '@booking/contracts';
import type { ApiAuth } from '~/lib/api.server';
import { getOptionalUser, requireScope, type AuthContext } from '~/lib/auth.server';
import { getCurrentDashboardHost, getCurrentHostTenant } from '~/lib/request-auth.server';
import { partnerMembershipIn } from '~/lib/workspace';
import { dashboardPaths } from '~/constants/paths';

/**
 * Resolved partner request context for a loader/action. Mirrors the tenant
 * guard's contract ({@link ~/features/tenant/server/tenant.server}): every area
 * guard returns `{ ctx, membership, auth, can }`.
 */
export interface PartnerContext {
  ctx: AuthContext;
  /** The partner scope membership (tenant/partner ids, roles, permissions). */
  membership: ScopeMembership & { tenantId: string; partnerId: string };
  /** api.server auth descriptor carrying the scope headers the backend requires. */
  auth: ApiAuth;
  /** UI gate — true when the signed-in user holds `permission` in the partner scope. */
  can: (permission: string) => boolean;
}

/**
 * Guards a partner route. Pass a `permission` key to require it (deny-by-default,
 * mirrors `requireTenant`); omit it to only require partner-scope membership.
 * Use the returned `can` for soft checks (hiding buttons, action-level form
 * errors) — those must NOT throw.
 *
 * Host-checked first, before the auth check below — see the matching comment
 * on `requireTenant` (`features/tenant/server/tenant.server.ts`) for why: every
 * child route calls this guard too, and a redirect thrown by any matched
 * loader wins over a plain 404 thrown by another, so the check has to happen
 * here rather than only in `_layout.tsx` for the anonymous branch to actually
 * 404 instead of racing a child route's own login redirect.
 */
export async function requirePartner(
  request: Request,
  permission?: string,
): Promise<PartnerContext> {
  if (getCurrentDashboardHost().kind === 'platform') {
    throw (await getOptionalUser(request))
      ? redirect(dashboardPaths.workspaces)
      : new Response('Không tìm thấy trang.', { status: 404 });
  }
  const ctx = await requireScope(request, 'partner');
  const hostTenant = getCurrentHostTenant();
  const membership = partnerMembershipIn(ctx.info, hostTenant.id);
  if (!membership) {
    throw new Response(`Tài khoản này không có đối tác nào tại ${hostTenant.name}.`, {
      status: 404,
    });
  }
  if (permission && !membership.permissions.includes(permission)) {
    throw new Response(`Bạn không có quyền truy cập (${permission}).`, { status: 403 });
  }
  const auth: ApiAuth = {
    token: ctx.user.accessToken,
    tenantId: membership.tenantId,
    partnerId: membership.partnerId,
  };
  return {
    ctx,
    membership: { ...membership, tenantId: membership.tenantId, partnerId: membership.partnerId },
    auth,
    can: (key) => membership.permissions.includes(key),
  };
}
