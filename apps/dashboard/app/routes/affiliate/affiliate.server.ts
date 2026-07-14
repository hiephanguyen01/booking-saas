import type { AffiliateResponse } from '@booking/contracts';
import { apiGet, type ApiAuth } from '~/lib/api.server';
import { requireSessionInfo, type AuthContext } from '~/lib/auth.server';

/**
 * Membership-gated context for the affiliate self-service portal (§15.3).
 * Affiliates are NOT an RBAC scope — any logged-in user may hold an `affiliates`
 * row. We resolve the user's memberships from the backend (`/affiliate/me`) and
 * select the active one from `?tenant=` or the first approved membership. The
 * `x-affiliate-tenant` header on `auth` tells the backend which one to act in.
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
  const baseAuth: ApiAuth = { token: ctx.user.accessToken, refreshToken: ctx.user.refreshToken };

  const res = await apiGet<AffiliateResponse[]>('/affiliate/me', baseAuth);
  const memberships = res.ok ? (res.data ?? []) : [];
  const approved = memberships.filter((m) => m.status === 'approved');

  const requested = new URL(request.url).searchParams.get('tenant');
  const active = (requested ? approved.find((m) => m.tenantId === requested) : approved[0]) ?? null;

  return {
    ctx,
    memberships,
    active,
    auth: active ? { ...baseAuth, affiliateTenantId: active.tenantId } : baseAuth,
  };
}
