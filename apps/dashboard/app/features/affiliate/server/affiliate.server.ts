import type { AffiliateResponse } from '@booking/contracts';
import { apiGet, type ApiAuth } from '~/lib/api.server';
import { requireSessionInfo, type AuthContext } from '~/lib/auth.server';
import { getCurrentHostTenant } from '~/lib/request-auth.server';
import { apiPaths } from '~/constants/api-paths';

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

export async function requireAffiliate(request: Request): Promise<AffiliateAreaContext> {
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
