import type {
  RoleRef,
  TenantInvitation,
  TenantMember,
  TenantPermissionKey,
  TenantRoleDetail,
  TenantRoleSummary,
} from '@booking/contracts';
import type { RoleRow } from '../domain/ports/tenant-role-repository.port';
import type { MemberRow } from '../domain/ports/tenant-member-repository.port';
import type { InvitationRow } from '../domain/ports/tenant-invitation-repository.port';
import { invitationStateOf } from '../domain/tenant-access-policy';

/**
 * Fields are listed explicitly. Never spread a repository row into a response —
 * persistence-only keys become accidental wire contract that way.
 */
export function toTenantRoleSummary(row: RoleRow): TenantRoleSummary {
  return { id: row.id, name: row.name, isSystem: row.isSystem, memberCount: row.memberCount };
}

export function toTenantRoleDetail(row: RoleRow): TenantRoleDetail {
  return {
    ...toTenantRoleSummary(row),
    permissions: row.permissions as TenantPermissionKey[],
  };
}

export function toRoleRef(row: RoleRow): RoleRef {
  return { id: row.id, name: row.name };
}

export function toTenantMember(row: MemberRow): TenantMember {
  return {
    userId: row.userId,
    fullName: row.fullName,
    email: row.email,
    avatarUrl: row.avatarUrl,
    roles: row.roles.map((r) => ({ id: r.id, name: r.name })),
    permissions: row.permissions as TenantPermissionKey[],
    joinedAt: row.joinedAt.toISOString(),
  };
}

export function toTenantInvitation(
  row: InvitationRow,
  roleNames: ReadonlyMap<string, string>,
  now: Date,
): TenantInvitation {
  return {
    id: row.id,
    email: row.email,
    // A role deleted since the invite was sent simply drops out of the display.
    roles: row.roleIds.flatMap((id) => {
      const name = roleNames.get(id);
      return name ? [{ id, name }] : [];
    }),
    status: invitationStateOf(row, now),
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    invitedByName: row.invitedByName,
  };
}
