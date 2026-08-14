import type {
  PartnerMember,
  PartnerPermissionKey,
  RoleRef,
  TenantInvitation,
} from '@booking/contracts';
import type { InvitationRow } from '../../identity-access/domain/ports/tenant-invitation-repository.port';
import { invitationStateOf } from '../../identity-access/domain/tenant-access-policy';
import type { PartnerRoleRow, PartnerStaffRow } from '../domain/ports/partner-staff-repository.port';

/**
 * Fields are listed explicitly. Never spread a repository row into a
 * response — persistence-only keys become accidental wire contract that way.
 * `membershipMissing` in particular must never reach the wire: it is an
 * internal data-integrity signal (see `partner-staff-repository.port.ts`),
 * not something a caller should see or branch on.
 */
export function toPartnerMember(row: PartnerStaffRow): PartnerMember {
  return {
    userId: row.userId,
    fullName: row.fullName,
    email: row.email,
    avatarUrl: row.avatarUrl,
    roles: row.roles.map((r) => ({ id: r.id, name: r.name })),
    // Union of every assigned role's keys — what the person can actually do.
    permissions: row.permissions as PartnerPermissionKey[],
    joinedAt: row.joinedAt.toISOString(),
  };
}

export function toPartnerRoleRef(row: PartnerRoleRow): RoleRef {
  return { id: row.id, name: row.name };
}

/**
 * Same wire shape as the tenant tier's `TenantInvitation` (no `partnerId`
 * field — a partner invitation list is already scoped to one partner by the
 * caller, so the response carries nothing to distinguish itself). Written
 * locally rather than imported from identity-access's own mapper: mapper
 * functions are application-layer, and each module maps its own repository
 * rows to its own responses — `InvitationRow` and `invitationStateOf` are
 * identity-access DOMAIN exports (ports + a pure function), which partner
 * already depends on elsewhere (e.g. `partner-membership-writer.adapter.ts`).
 */
export function toPartnerInvitation(
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
