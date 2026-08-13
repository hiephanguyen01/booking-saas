import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type {
  ITenantMemberRepository,
  MemberRow,
} from '../../domain/ports/tenant-member-repository.port';

const memberInclude = {
  user: { select: { id: true, fullName: true, email: true, avatarUrl: true } },
  role: { include: { rolePermissions: true } },
} as const;

type MemberAssignmentRow = Prisma.RoleAssignmentGetPayload<{ include: typeof memberInclude }>;

/**
 * Groups tenant-scoped role_assignments (partner_id IS NULL) by user, unioning
 * role names and permission keys across all of that user's roles — the same
 * shape PrismaSessionInfoReader produces for session memberships, so the
 * member list and what a user can actually do never disagree. Rows arrive
 * ordered by createdAt asc, so the first row seen for a user carries their
 * earliest assignment, which doubles as `joinedAt`.
 */
function toMemberRows(rows: MemberAssignmentRow[]): MemberRow[] {
  const byUser = new Map<string, MemberRow>();
  for (const row of rows) {
    let member = byUser.get(row.userId);
    if (!member) {
      member = {
        userId: row.user.id,
        fullName: row.user.fullName,
        email: row.user.email,
        avatarUrl: row.user.avatarUrl,
        roles: [],
        permissions: [],
        joinedAt: row.createdAt,
      };
      byUser.set(row.userId, member);
    }
    if (!member.roles.some((r) => r.id === row.role.id)) {
      member.roles.push({ id: row.role.id, name: row.role.name });
    }
    for (const rp of row.role.rolePermissions) {
      if (!member.permissions.includes(rp.permissionKey)) {
        member.permissions.push(rp.permissionKey);
      }
    }
  }
  return [...byUser.values()];
}

@Injectable()
export class PrismaTenantMemberRepository implements ITenantMemberRepository {
  async list(tx: PrismaTx, tenantId: string): Promise<MemberRow[]> {
    const rows = await tx.roleAssignment.findMany({
      where: { tenantId, partnerId: null },
      include: memberInclude,
      orderBy: { createdAt: 'asc' },
    });
    return toMemberRows(rows);
  }

  async findOne(tx: PrismaTx, tenantId: string, userId: string): Promise<MemberRow | null> {
    const rows = await tx.roleAssignment.findMany({
      where: { tenantId, partnerId: null, userId },
      include: memberInclude,
      orderBy: { createdAt: 'asc' },
    });
    return toMemberRows(rows)[0] ?? null;
  }

  async addRoles(
    tx: PrismaTx,
    tenantId: string,
    userId: string,
    roleIds: readonly string[],
  ): Promise<void> {
    if (roleIds.length === 0) return;
    // skipDuplicates: assigning a role the user already holds in this tenant
    // would otherwise trip role_assignments_user_role_scope_key (NULLS NOT
    // DISTINCT unique index) — the caller may re-offer roles already held.
    await tx.roleAssignment.createMany({
      data: roleIds.map((roleId) => ({ userId, roleId, tenantId, partnerId: null })),
      skipDuplicates: true,
    });
  }

  async removeRoles(
    tx: PrismaTx,
    tenantId: string,
    userId: string,
    roleIds: readonly string[],
  ): Promise<void> {
    if (roleIds.length === 0) return;
    await tx.roleAssignment.deleteMany({
      where: { tenantId, partnerId: null, userId, roleId: { in: [...roleIds] } },
    });
  }

  async removeAll(tx: PrismaTx, tenantId: string, userId: string): Promise<void> {
    await tx.roleAssignment.deleteMany({ where: { tenantId, partnerId: null, userId } });
  }

  async findUserIdByEmail(tx: PrismaTx, email: string): Promise<string | null> {
    const user = await tx.user.findUnique({ where: { email }, select: { id: true } });
    return user?.id ?? null;
  }

  async holdersOfRole(tx: PrismaTx, tenantId: string, roleId: string): Promise<string[]> {
    const rows = await tx.roleAssignment.findMany({
      where: { tenantId, partnerId: null, roleId },
      select: { userId: true },
    });
    return rows.map((r) => r.userId);
  }
}
