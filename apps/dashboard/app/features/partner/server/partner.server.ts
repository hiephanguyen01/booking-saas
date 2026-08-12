import type { ScopeMembership } from '@booking/contracts';
import type { ApiAuth } from '~/lib/api.server';
import { requireScope, type AuthContext } from '~/lib/auth.server';
import { getCurrentHostTenant } from '~/lib/request-auth.server';
import { partnerMembershipIn } from '~/lib/workspace';

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
 */
export async function requirePartner(
  request: Request,
  permission?: string,
): Promise<PartnerContext> {
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
