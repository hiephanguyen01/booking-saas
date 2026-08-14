import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type {
  IPartnerStaffRepository,
  PartnerRoleRow,
  PartnerStaffRow,
} from '../../domain/ports/partner-staff-repository.port';

const logger = new Logger('PrismaPartnerStaffRepository');

const roleInclude = { rolePermissions: true } as const;
type RoleQueryRow = Prisma.RoleGetPayload<{ include: typeof roleInclude }>;

function toRoleRow(role: RoleQueryRow): PartnerRoleRow {
  return {
    id: role.id,
    name: role.name,
    isSystem: role.isSystem,
    permissions: role.rolePermissions.map((rp) => rp.permissionKey),
  };
}

/**
 * Partner-scope roles assignable in this partner: the shared system ones
 * (partnerId IS NULL, isSystem) plus this partner's own. A role belonging to
 * a DIFFERENT partner can never match — there is no clause that admits it.
 */
function assignableRoleWhere(partnerId: string) {
  return {
    scopeLevel: 'partner' as const,
    OR: [{ partnerId }, { partnerId: null, isSystem: true }],
  };
}

const staffAssignmentInclude = {
  user: { select: { id: true, fullName: true, email: true, avatarUrl: true } },
  role: { include: roleInclude },
} as const;
type StaffAssignmentRow = Prisma.RoleAssignmentGetPayload<{ include: typeof staffAssignmentInclude }>;

/**
 * Groups partner-scope role_assignments (this tenant + partner) by user,
 * unioning role names and permission keys across all of that user's roles —
 * the same shape PrismaSessionInfoReader produces, so the staff list and what
 * a user can actually do never disagree.
 *
 * `joinedAt` is read from `joinedAtByUser` (the partner_members row), never
 * from the assignment — membership is what "joined" means here, and the two
 * can differ once roles are edited.
 *
 * A user missing from `joinedAtByUser` has an assignment but no member row —
 * exactly the failure addStaff/removeStaff's lockstep write exists to prevent.
 * DO NOT silently backfill a plausible-looking date and move on: a missing
 * partner_members row has no other symptom until booking notification mail
 * quietly stops arriving, so the one thing this repository must never do on
 * that path is make the row look ordinary. `joinedAt` still gets a usable
 * fallback (the assignment's own `createdAt`) so the field stays a plain
 * `Date` for every caller, but `membershipMissing: true` and a warn log are
 * what keep the anomaly visible instead of smoothing it away. If you're
 * tempted to delete this branch as dead code because addStaff/removeStaff are
 * airtight: it is dead in the write path by construction, but this is the
 * read path's only chance to catch a violation from anywhere else — leave it.
 */
function toStaffRows(
  rows: StaffAssignmentRow[],
  joinedAtByUser: ReadonlyMap<string, Date>,
): PartnerStaffRow[] {
  const byUser = new Map<string, PartnerStaffRow>();
  for (const row of rows) {
    let member = byUser.get(row.userId);
    if (!member) {
      const joinedAt = joinedAtByUser.get(row.userId);
      const membershipMissing = joinedAt === undefined;
      if (membershipMissing) {
        logger.warn(
          `partner_members row missing for partner=${row.partnerId} user=${row.userId} ` +
            '— a role_assignments row exists without it, so this person is not on the ' +
            'booking-notification recipient list. Investigate: this should be unreachable ' +
            'via addStaff/removeStaff.',
        );
      }
      member = {
        userId: row.user.id,
        fullName: row.user.fullName,
        email: row.user.email,
        avatarUrl: row.user.avatarUrl,
        roles: [],
        permissions: [],
        joinedAt: joinedAt ?? row.createdAt,
        membershipMissing,
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
export class PrismaPartnerStaffRepository implements IPartnerStaffRepository {
  async list(tx: PrismaTx, tenantId: string, partnerId: string): Promise<PartnerStaffRow[]> {
    const [rows, members] = await Promise.all([
      tx.roleAssignment.findMany({
        where: { tenantId, partnerId },
        include: staffAssignmentInclude,
        orderBy: { createdAt: 'asc' },
      }),
      tx.partnerMember.findMany({
        where: { tenantId, partnerId },
        select: { userId: true, createdAt: true },
      }),
    ]);
    const joinedAtByUser = new Map(members.map((m) => [m.userId, m.createdAt]));
    return toStaffRows(rows, joinedAtByUser);
  }

  async findOne(
    tx: PrismaTx,
    tenantId: string,
    partnerId: string,
    userId: string,
  ): Promise<PartnerStaffRow | null> {
    const [rows, member] = await Promise.all([
      tx.roleAssignment.findMany({
        where: { tenantId, partnerId, userId },
        include: staffAssignmentInclude,
        orderBy: { createdAt: 'asc' },
      }),
      tx.partnerMember.findFirst({
        where: { tenantId, partnerId, userId },
        select: { createdAt: true },
      }),
    ]);
    const joinedAtByUser = member ? new Map([[userId, member.createdAt]]) : new Map<string, Date>();
    return toStaffRows(rows, joinedAtByUser)[0] ?? null;
  }

  async filterAssignableRoles(
    tx: PrismaTx,
    partnerId: string,
    roleIds: readonly string[],
  ): Promise<PartnerRoleRow[]> {
    if (roleIds.length === 0) return [];
    const roles = await tx.role.findMany({
      where: { id: { in: [...roleIds] }, ...assignableRoleWhere(partnerId) },
      include: roleInclude,
    });
    return roles.map(toRoleRow);
  }

  async listAssignableRoles(tx: PrismaTx, partnerId: string): Promise<PartnerRoleRow[]> {
    const roles = await tx.role.findMany({
      where: assignableRoleWhere(partnerId),
      include: roleInclude,
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    });
    return roles.map(toRoleRow);
  }

  async addStaff(
    tx: PrismaTx,
    {
      tenantId,
      partnerId,
      userId,
      roleIds,
    }: { tenantId: string; partnerId: string; userId: string; roleIds: readonly string[] },
  ): Promise<string[]> {
    // LOCKSTEP. `partner_members` is not a duplicate of `role_assignments` — it is the
    // notification recipient list (`prisma-notification.reader.ts:145,214`). A person with
    // assignments but no member row manages bookings and is never told a booking happened,
    // silently. Both rows are written here or neither is.
    const roles = await this.filterAssignableRoles(tx, partnerId, roleIds);
    if (roles.length === 0) return [];

    await tx.partnerMember.createMany({
      data: [{ tenantId, partnerId, userId }],
      skipDuplicates: true, // re-inviting an existing member must not fail on @@unique([partnerId, userId])
    });
    await tx.roleAssignment.createMany({
      data: roles.map((r) => ({ userId, roleId: r.id, tenantId, partnerId })),
      skipDuplicates: true,
    });
    return roles.map((r) => r.id);
  }

  async setRoles(
    tx: PrismaTx,
    {
      tenantId,
      partnerId,
      userId,
      roleIds,
    }: { tenantId: string; partnerId: string; userId: string; roleIds: readonly string[] },
  ): Promise<void> {
    // Membership is untouched by design: the person stays on the team (and on
    // the notification list) even if this leaves them holding zero roles.
    const roles = await this.filterAssignableRoles(tx, partnerId, roleIds);
    await tx.roleAssignment.deleteMany({ where: { tenantId, partnerId, userId } });
    if (roles.length === 0) return;
    await tx.roleAssignment.createMany({
      data: roles.map((r) => ({ userId, roleId: r.id, tenantId, partnerId })),
      skipDuplicates: true,
    });
  }

  async removeStaff(tx: PrismaTx, tenantId: string, partnerId: string, userId: string): Promise<void> {
    // LOCKSTEP, the other direction. Leaving the member row behind would keep mailing
    // booking notifications to someone who can no longer act on them.
    await tx.roleAssignment.deleteMany({ where: { userId, tenantId, partnerId } });
    await tx.partnerMember.deleteMany({ where: { partnerId, userId } });
  }
}
