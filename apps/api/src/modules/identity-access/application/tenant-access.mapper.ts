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
 * is already the assignable subset, already shaped as `RoleRef` — the caller
 * resolves it through one of two ports depending on `row.partnerId` (tenant
 * roles via `ITenantRoleRepository`, mapped through `toRoleRef`; partner
 * roles via `IPartnerRoleReader`, already `{id, name}`), so this mapper takes
 * the final shape directly rather than assuming one repository row type.
 * `partnerName` is null for a tenant-scope invitation and set for a
 * partner-scope one, so the acceptance screen can tell the recipient which
 * they are joining.
 */
export function toTenantInvitationPreview(
  row: InvitationRow,
  roles: readonly RoleRef[],
  matchesCurrentUser: boolean,
  now: Date,
): TenantInvitationPreview {
  return {
    tenantName: row.tenantName,
    invitedEmail: row.email,
    roles: [...roles],
    status: invitationStateOf(row, now),
    matchesCurrentUser,
    partnerName: row.partnerName,
  };
}
