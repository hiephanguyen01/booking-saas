import type { RoleRef } from '@booking/contracts';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';

export const PARTNER_ROLE_READER = Symbol('PARTNER_ROLE_READER');

/**
 * Read-only sibling of `IPartnerMembershipWriter` (same cross-module problem,
 * same fix): lets the shared invitation PREVIEW resolve partner-scope role
 * names without identity-access ever importing the partner module.
 *
 * Needed because `GetInvitationPreviewUseCase` cannot reuse
 * `TENANT_ROLE_REPOSITORY.filterAssignable` for a partner-scope invitation —
 * that query filters `scopeLevel: 'tenant'`, so for `roleIds` that are all
 * `scopeLevel: 'partner'` it silently returns `[]` every time, and the
 * preview would show a real partner name beside an empty role list. Accept is
 * unaffected: `AcceptTenantInvitationUseCase` resolves partner-scope roles
 * through `IPartnerMembershipWriter.materialize`, a completely separate read.
 *
 * The partner module implements this (`PartnerRoleReaderAdapter`); the
 * dependency runs partner → identity-access, the direction that already
 * exists for guards/decorators, so no cycle is created.
 */
export interface IPartnerRoleReader {
  /**
   * Filters `roleIds` down to the ones assignable in this partner. `{id,
   * name}` only — the preview needs no more, and returning less than the
   * full `PartnerRoleRow` keeps this port from becoming a second copy of
   * `IPartnerStaffRepository`.
   */
  filterAssignable(
    tx: PrismaTx,
    partnerId: string,
    roleIds: readonly string[],
  ): Promise<RoleRef[]>;
}
