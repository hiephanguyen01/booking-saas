import { redirect } from 'react-router';
import type { AffiliateResponse } from '@booking/contracts';
import { apiGet, type ApiAuth } from '~/lib/api.server';
import { getOptionalUser, requireSessionInfo, type AuthContext } from '~/lib/auth.server';
import { getCurrentDashboardHost, getCurrentHostTenant } from '~/lib/request-auth.server';
import { apiPaths } from '~/constants/api-paths';
import { dashboardPaths } from '~/constants/paths';

/**
 * Membership-gated context for the affiliate self-service portal (§15.3).
 * Affiliates are NOT an RBAC scope — any logged-in user may hold an `affiliates`
 * row. We resolve the user's memberships from the backend (apiPaths.affiliate.me) and
 * select the approved membership for the host's tenant. The `x-affiliate-tenant`
 * header on `auth` tells the backend which one to act in.
 */
export interface AffiliateAreaContext {
  ctx: AuthContext;
  memberships: AffiliateResponse[];
  /** The approved membership currently being viewed, or null when none is approved. */
  active: AffiliateResponse | null;
  /** API auth pre-scoped to the active membership (adds `x-affiliate-tenant`). */
  auth: ApiAuth;
}

/**
 * Host-checked first, before the auth check below — see the matching comment
 * on `requireTenant` (`features/tenant/server/tenant.server.ts`) for why: every
 * child route calls this guard too, and a redirect thrown by any matched
 * loader wins over a plain 404 thrown by another, so the check has to happen
 * here rather than only in `_layout.tsx` for the anonymous branch to actually
 * 404 instead of racing a child route's own login redirect.
 */
export async function requireAffiliate(request: Request): Promise<AffiliateAreaContext> {
  if (getCurrentDashboardHost().kind === 'platform') {
    throw (await getOptionalUser(request))
      ? redirect(dashboardPaths.workspaces)
      : new Response('Không tìm thấy trang.', { status: 404 });
  }
  const ctx = await requireSessionInfo(request);
  const baseAuth: ApiAuth = { token: ctx.user.accessToken };

  const res = await apiGet<AffiliateResponse[]>(apiPaths.affiliate.me, baseAuth);
  const memberships = res.ok ? (res.data ?? []) : [];
  const approved = memberships.filter((m) => m.status === 'approved');

  const hostTenant = getCurrentHostTenant();
  const active = approved.find((membership) => membership.tenantId === hostTenant.id) ?? null;

  return {
    ctx,
    memberships,
    active,
    auth: active ? { ...baseAuth, affiliateTenantId: active.tenantId } : baseAuth,
  };
}
