import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';

export const TENANT_MEMBER_REPOSITORY = Symbol('TENANT_MEMBER_REPOSITORY');

export interface MemberRow {
  userId: string;
  fullName: string;
  email: string;
  avatarUrl: string | null;
  roles: { id: string; name: string }[];
  permissions: string[];
  joinedAt: Date;
}

export interface ITenantMemberRepository {
  /** Every user holding a tenant-scoped assignment (partner_id IS NULL), grouped. */
  list(tx: PrismaTx, tenantId: string): Promise<MemberRow[]>;
  findOne(tx: PrismaTx, tenantId: string, userId: string): Promise<MemberRow | null>;
  addRoles(tx: PrismaTx, tenantId: string, userId: string, roleIds: readonly string[]): Promise<void>;
  removeRoles(tx: PrismaTx, tenantId: string, userId: string, roleIds: readonly string[]): Promise<void>;
  /** Deletes every tenant-scoped assignment of that user. */
  removeAll(tx: PrismaTx, tenantId: string, userId: string): Promise<void>;
  findUserIdByEmail(tx: PrismaTx, email: string): Promise<string | null>;
  /**
   * User ids holding this role IN THIS TENANT. Editing a role changes what its
   * holders may do, so each of them needs their permission cache invalidated.
   */
  holdersOfRole(tx: PrismaTx, tenantId: string, roleId: string): Promise<string[]>;
}
