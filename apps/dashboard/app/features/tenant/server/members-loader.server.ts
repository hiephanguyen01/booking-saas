import type { TenantInvitation, TenantMember, TenantRoleDetail } from '@booking/contracts';
import { apiGet } from '~/lib/api.server';
import { apiPaths } from '~/constants/api-paths';
import { requireTenant } from '~/features/tenant/server/tenant.server';

/**
 * Read path for the tenant staff area ("Nhân sự" + "Vai trò" tabs). Two
 * independent permissions gate two independent halves of this screen —
 * `tenant.members.manage` for the "Nhân sự"/"Lời mời" tabs, `tenant.roles.manage`
 * for "Vai trò" — so `requireTenant` is called with NO permission argument.
 * Requiring `tenant.members.manage` up front (as an earlier version of this
 * loader did) 403'd a caller who holds only `tenant.roles.manage` before they
 * ever reached the "Vai trò" tab the nav's own
 * `anyPermissions: ['tenant.members.manage', 'tenant.roles.manage']` promises
 * them. A caller holding NEITHER permission has no business on this screen —
 * the nav item is already hidden for them, but the URL is still directly
 * reachable — so that combination still 403s explicitly below.
 *
 * Members/invitations and roles are each fetched only under their own
 * permission, and each reports its own failure rather than throwing — one
 * dead endpoint must not blank the whole page (mirrors
 * `settings-loader.server.ts`). `null` (not `[]`) marks "not permitted to
 * see" for all three lists, distinct from "fetched, zero rows" — the owning
 * tab stays hidden via `canManageMembers`/`canManageRoles`, never by checking
 * for `null`, since a permitted-but-failed fetch is also `null` here (its
 * `*Error` field is what distinguishes the two).
 */
export async function loadTenantMembers(request: Request) {
  const { auth, can, ctx } = await requireTenant(request);
  const canManageMembers = can('tenant.members.manage');
  const canManageRoles = can('tenant.roles.manage');
  if (!canManageMembers && !canManageRoles) {
    throw new Response('Bạn không có quyền truy cập trang này.', { status: 403 });
  }

  const [membersRes, invitationsRes, rolesRes] = await Promise.all([
    canManageMembers ? apiGet<TenantMember[]>(apiPaths.tenant.members, auth) : Promise.resolve(null),
    canManageMembers
      ? apiGet<TenantInvitation[]>(apiPaths.tenant.invitations, auth)
      : Promise.resolve(null),
    canManageRoles ? apiGet<TenantRoleDetail[]>(apiPaths.tenant.roles, auth) : Promise.resolve(null),
  ]);

  return {
    members: membersRes?.ok ? (membersRes.data ?? []) : null,
    membersError:
      membersRes && !membersRes.ok ? (membersRes.error ?? 'Không tải được danh sách nhân sự.') : null,
    invitations: invitationsRes?.ok ? (invitationsRes.data ?? []) : null,
    invitationsError:
      invitationsRes && !invitationsRes.ok ? (invitationsRes.error ?? 'Không tải được lời mời.') : null,
    roles: rolesRes?.ok ? (rolesRes.data ?? []) : null,
    rolesError: rolesRes && !rolesRes.ok ? (rolesRes.error ?? 'Không tải được vai trò.') : null,
    // Precomputed booleans, never the `can` function itself: React Router 8's
    // single-fetch wire format (turbo-stream, see
    // `react-router/dist/.../vendor/turbo-stream-v2/flatten.js`) has no
    // encoding for a function value — it falls through to a
    // `SingleFetchFallback` marker that decodes to `undefined` on the client
    // (`lib/dom/ssr/single-fetch.js`), so `loaderData.can(...)` would throw
    // once hydration swaps in the deserialized copy of this object. Every
    // permission check a consumer of this loader needs must be evaluated
    // here, server-side, and returned as a plain boolean — matching
    // `settings-loader.server.ts`'s `canTheme`/`canSettings`/`canFinance`/
    // `canLegal` convention. Do not reintroduce a raw `can` on this object.
    // Same reasoning applies to `currentUserId` below: it stays a plain
    // string (never a function, `Date`, `Map`, `Set` or class instance) for
    // the same turbo-stream reason. The backend enforces no-self-edit on its
    // own (`CANNOT_EDIT_SELF`), but the UI must not offer "Sửa vai trò"/"Gỡ
    // khỏi tenant" on the signed-in user's own row in the first place —
    // `MembersTable` compares this id against each row's `userId`.
    currentUserId: ctx.user.userId,
    canManageMembers,
    canManageRoles,
  };
}
