import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';

export const TENANT_ROLE_REPOSITORY = Symbol('TENANT_ROLE_REPOSITORY');

export interface RoleRow {
  id: string;
  name: string;
  isSystem: boolean;
  permissions: string[];
  memberCount: number;
}

export interface ITenantRoleRepository {
  /** System tenant roles (shared, `tenant_id IS NULL`) + this tenant's own. */
  list(tx: PrismaTx, tenantId: string): Promise<RoleRow[]>;
  findById(tx: PrismaTx, tenantId: string, roleId: string): Promise<RoleRow | null>;
  /** Filters `roleIds` down to the ones assignable in this tenant. */
  filterAssignable(tx: PrismaTx, tenantId: string, roleIds: readonly string[]): Promise<RoleRow[]>;
  create(tx: PrismaTx, tenantId: string, name: string, permissions: readonly string[]): Promise<string>;
  /**
   * Replaces name + the whole permission set. Custom roles only. Returns false
   * when no role with that id belongs to this tenant, in which case nothing —
   * name or permissions — was written.
   */
  update(tx: PrismaTx, tenantId: string, roleId: string, name: string, permissions: readonly string[]): Promise<boolean>;
  delete(tx: PrismaTx, tenantId: string, roleId: string): Promise<void>;
}
