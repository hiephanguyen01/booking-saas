import type {
  RoleRef,
  TenantInvitation,
  TenantInvitationPreview,
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

/**
 * The recipient's preview, keyed by token rather than tenant scope. `roles`
 * is already the assignable subset (a role deleted since the invite was
 * sent has already been filtered out by the caller) — mapped straight to
 * `RoleRef`, no lookup-by-id needed.
 */
export function toTenantInvitationPreview(
  row: InvitationRow,
  roles: RoleRow[],
  matchesCurrentUser: boolean,
  now: Date,
): TenantInvitationPreview {
  return {
    tenantName: row.tenantName,
    invitedEmail: row.email,
    roles: roles.map(toRoleRef),
    status: invitationStateOf(row, now),
    matchesCurrentUser,
  };
}
