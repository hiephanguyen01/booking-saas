import type { TenantInvitation, TenantMember, TenantRoleDetail } from '@booking/contracts';
import { apiGet } from '~/lib/api.server';
import { apiPaths } from '~/constants/api-paths';
import { requireTenant } from '~/features/tenant/server/tenant.server';

/**
 * Read path for the tenant staff area ("Nhân sự" + "Vai trò" tabs). Members
 * and invitations are this area's primary data, so each reports its own
 * failure rather than throwing — one dead endpoint must not blank the whole
 * page (mirrors `settings-loader.server.ts`).
 *
 * Roles are fetched only when the caller holds `tenant.roles.manage`:
 * `GET /tenant/roles` declares that stricter permission (§tenant-role.controller),
 * so a caller who only holds `tenant.members.manage` must never trigger it —
 * that would 403 and break their own page load instead of just hiding the
 * "Vai trò" tab.
 */
export async function loadTenantMembers(request: Request) {
  const { auth, can } = await requireTenant(request, 'tenant.members.manage');
  const canManageRoles = can('tenant.roles.manage');

  const [membersRes, invitationsRes, rolesRes] = await Promise.all([
    apiGet<TenantMember[]>(apiPaths.tenant.members, auth),
    apiGet<TenantInvitation[]>(apiPaths.tenant.invitations, auth),
    canManageRoles ? apiGet<TenantRoleDetail[]>(apiPaths.tenant.roles, auth) : Promise.resolve(null),
  ]);

  return {
    members: membersRes.ok ? (membersRes.data ?? []) : [],
    membersError: membersRes.ok ? null : (membersRes.error ?? 'Không tải được danh sách nhân sự.'),
    invitations: invitationsRes.ok ? (invitationsRes.data ?? []) : [],
    invitationsError: invitationsRes.ok
      ? null
      : (invitationsRes.error ?? 'Không tải được lời mời.'),
    // Null distinguishes "not permitted to see" from "fetched, zero roles" —
    // the roles tab itself stays hidden for the former (`canManageRoles`).
    roles: rolesRes?.ok ? (rolesRes.data ?? []) : null,
    rolesError: rolesRes && !rolesRes.ok ? (rolesRes.error ?? 'Không tải được vai trò.') : null,
    canManageRoles,
    can,
  };
}
