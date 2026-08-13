import { Injectable } from '@nestjs/common';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type {
  ITenantRoleRepository,
  RoleRow,
} from '../../domain/ports/tenant-role-repository.port';

interface RoleQueryRow {
  id: string;
  name: string;
  isSystem: boolean;
  rolePermissions: { permissionKey: string }[];
  _count: { roleAssignments: number };
}

/**
 * memberCount always re-filters roleAssignments down to THIS tenant
 * (tenantId match, partnerId IS NULL) — a shared system role's holders in
 * other tenants, or a partner-scope assignment of the same role, are never
 * this tenant's business.
 */
function roleInclude(tenantId: string) {
  return {
    rolePermissions: true,
    _count: { select: { roleAssignments: { where: { tenantId, partnerId: null } } } },
  } as const;
}

function toRoleRow(role: RoleQueryRow): RoleRow {
  return {
    id: role.id,
    name: role.name,
    isSystem: role.isSystem,
    permissions: role.rolePermissions.map((rp) => rp.permissionKey),
    memberCount: role._count.roleAssignments,
  };
}

/**
 * System tenant roles are shared (tenant_id IS NULL, is_system = true) — the
 * `roles` table's RLS policy already makes them visible under any tenant
 * context, so every read here folds them in alongside the tenant's own roles.
 */
@Injectable()
export class PrismaTenantRoleRepository implements ITenantRoleRepository {
  async list(tx: PrismaTx, tenantId: string): Promise<RoleRow[]> {
    const roles = await tx.role.findMany({
      where: { scopeLevel: 'tenant', OR: [{ tenantId }, { tenantId: null, isSystem: true }] },
      include: roleInclude(tenantId),
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    });
    return roles.map(toRoleRow);
  }

  async findById(tx: PrismaTx, tenantId: string, roleId: string): Promise<RoleRow | null> {
    const role = await tx.role.findFirst({
      where: {
        id: roleId,
        scopeLevel: 'tenant',
        OR: [{ tenantId }, { tenantId: null, isSystem: true }],
      },
      include: roleInclude(tenantId),
    });
    return role ? toRoleRow(role) : null;
  }

  async filterAssignable(
    tx: PrismaTx,
    tenantId: string,
    roleIds: readonly string[],
  ): Promise<RoleRow[]> {
    if (roleIds.length === 0) return [];
    const roles = await tx.role.findMany({
      where: {
        id: { in: [...roleIds] },
        scopeLevel: 'tenant',
        OR: [{ tenantId }, { tenantId: null, isSystem: true }],
      },
      include: roleInclude(tenantId),
    });
    return roles.map(toRoleRow);
  }

  async create(
    tx: PrismaTx,
    tenantId: string,
    name: string,
    permissions: readonly string[],
  ): Promise<string> {
    const role = await tx.role.create({
      data: { tenantId, name, scopeLevel: 'tenant', isSystem: false },
    });
    await tx.rolePermission.createMany({
      data: permissions.map((permissionKey) => ({ roleId: role.id, permissionKey })),
    });
    return role.id;
  }

  /**
   * Replaces name + the whole permission set. Custom roles only — the
   * use-case checks `!isSystem` (via `findById`) before ever calling this.
   *
   * The scoped role write runs FIRST and gates everything else: `role_permissions`
   * has no `tenant_id` column and no RLS policy at all (confirmed absent from every
   * migration), so this `{ id: roleId, tenantId }` match is the ONLY thing standing
   * between a caller and a shared system role's permission set. The permission rows
   * must never be touched before it has matched — returning false here means the
   * delete+recreate below never runs.
   */
  async update(
    tx: PrismaTx,
    tenantId: string,
    roleId: string,
    name: string,
    permissions: readonly string[],
  ): Promise<boolean> {
    const claimed = await tx.role.updateMany({ where: { id: roleId, tenantId }, data: { name } });
    if (claimed.count !== 1) return false;

    await tx.rolePermission.deleteMany({ where: { roleId } });
    await tx.rolePermission.createMany({
      data: permissions.map((permissionKey) => ({ roleId, permissionKey })),
    });
    return true;
  }

  /**
   * Scoped by tenantId so a shared system role (tenant_id IS NULL) can never
   * match here even though RLS alone would still let this tenant see one.
   */
  async delete(tx: PrismaTx, tenantId: string, roleId: string): Promise<void> {
    await tx.role.deleteMany({ where: { id: roleId, tenantId } });
  }
}
