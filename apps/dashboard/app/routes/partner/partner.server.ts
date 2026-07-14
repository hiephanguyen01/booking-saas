import type { ScopeMembership } from '@booking/contracts';
import type { ApiAuth } from '~/lib/api.server';
import { requireScope } from '~/lib/auth.server';
import { findPartnerMembership, workspaceIdFromPath } from '~/lib/workspace';

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
  const partnerId = workspaceIdFromPath(new URL(request.url).pathname, 'partner');
  if (!partnerId) throw new Response('Không tìm thấy partner.', { status: 404 });
  const membership = findPartnerMembership(info, partnerId);
  if (!membership) throw new Response('Không tìm thấy partner.', { status: 404 });
  const auth: ApiAuth = {
    token: user.accessToken,
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
