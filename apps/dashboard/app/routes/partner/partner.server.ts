import type { ScopeMembership } from '@booking/shared';
import type { ApiAuth } from '~/lib/api.server';
import { requireScope } from '~/lib/auth.server';

/** The resolved partner context every partner loader/action needs. */
export interface PartnerContext {
  /** api.server auth descriptor carrying the scope headers the backend requires. */
  auth: ApiAuth;
  /** The partner scope membership (tenant/partner ids, roles, permissions). */
  membership: ScopeMembership & { tenantId: string; partnerId: string };
}

/**
 * Guards a partner route and returns the api-auth descriptor (token + tenant +
 * partner scope headers) plus the membership. Redirects to login / 403 via
 * `requireScope`. Throws 403 when the partner membership lacks tenant/partner
 * ids (a malformed session).
 */
export async function requirePartner(request: Request): Promise<PartnerContext> {
  const { user, info } = await requireScope(request, 'partner');
  const membership = info.scopes.find((scope) => scope.scope === 'partner');
  if (!membership || !membership.tenantId || !membership.partnerId) {
    throw new Response('Thiếu ngữ cảnh đối tác.', { status: 403 });
  }
  const auth: ApiAuth = {
    token: user.accessToken,
    refreshToken: user.refreshToken,
    tenantId: membership.tenantId,
    partnerId: membership.partnerId,
  };
  return {
    auth,
    membership: { ...membership, tenantId: membership.tenantId, partnerId: membership.partnerId },
  };
}

/** True when the partner membership holds the given permission key. */
export function canPartner(membership: ScopeMembership, key: string): boolean {
  return membership.permissions.includes(key);
}
