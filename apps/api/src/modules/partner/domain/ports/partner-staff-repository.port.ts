import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';

export const PARTNER_STAFF_REPOSITORY = Symbol('PARTNER_STAFF_REPOSITORY');

export interface PartnerStaffRow {
  userId: string;
  fullName: string;
  email: string;
  avatarUrl: string | null;
  roles: { id: string; name: string }[];
  permissions: string[];
  joinedAt: Date;
  /**
   * True when this user has a partner-scope `role_assignments` row but no
   * matching `partner_members` row — exactly the failure the lockstep
   * invariant in `addStaff`/`removeStaff` exists to prevent. `addStaff` and
   * `removeStaff` never produce this by themselves; seeing `true` means
   * something outside this repository wrote one table without the other.
   * `joinedAt` still carries a usable fallback date in that case (the
   * assignment's own `createdAt`) so callers are never forced to handle a
   * null date, but this flag is what makes the gap visible rather than
   * silently indistinguishable from a normal member.
   */
  membershipMissing: boolean;
}

export interface PartnerRoleRow {
  id: string;
  name: string;
  isSystem: boolean;
  permissions: string[];
}

export interface IPartnerStaffRepository {
  /** Everyone holding a partner-scope assignment in this partner, grouped by user. */
  list(tx: PrismaTx, tenantId: string, partnerId: string): Promise<PartnerStaffRow[]>;
  findOne(tx: PrismaTx, tenantId: string, partnerId: string, userId: string): Promise<PartnerStaffRow | null>;
  /** Roles assignable in this partner: shared system partner roles plus this partner's own. */
  filterAssignableRoles(tx: PrismaTx, partnerId: string, roleIds: readonly string[]): Promise<PartnerRoleRow[]>;
  listAssignableRoles(tx: PrismaTx, partnerId: string): Promise<PartnerRoleRow[]>;
  /** LOCKSTEP: partner_members row + role assignments, together. Returns assigned role ids. */
  addStaff(tx: PrismaTx, params: { tenantId: string; partnerId: string; userId: string; roleIds: readonly string[] }): Promise<string[]>;
  /** Replaces the role set only. Membership is untouched — the person stays on the team. */
  setRoles(tx: PrismaTx, params: { tenantId: string; partnerId: string; userId: string; roleIds: readonly string[] }): Promise<void>;
  /** LOCKSTEP: deletes the partner_members row AND every partner-scope assignment. */
  removeStaff(tx: PrismaTx, tenantId: string, partnerId: string, userId: string): Promise<void>;
}
