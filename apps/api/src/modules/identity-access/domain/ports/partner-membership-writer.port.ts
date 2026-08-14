import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';

export const PARTNER_MEMBERSHIP_WRITER = Symbol('PARTNER_MEMBERSHIP_WRITER');

/**
 * Lets the shared accept flow materialise a PARTNER membership without
 * identity-access ever touching `partner_members`, which the partner module
 * owns. The partner module implements this; the dependency runs partner →
 * identity-access, the direction that already exists for guards and decorators,
 * so no cycle is created.
 */
export interface IPartnerMembershipWriter {
  /**
   * Creates the `partner_members` row and the partner-scope role assignments
   * TOGETHER, inside the caller's transaction. Roles that no longer exist are
   * dropped; the return value is the ids actually assigned, and an empty array
   * means none survived — the caller decides what that means.
   */
  materialize(
    tx: PrismaTx,
    params: { tenantId: string; partnerId: string; userId: string; roleIds: readonly string[] },
  ): Promise<string[]>;
}
