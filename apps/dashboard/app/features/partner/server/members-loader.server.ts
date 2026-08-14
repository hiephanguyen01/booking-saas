import type { PartnerMember, TenantInvitation } from '@booking/contracts';
import { apiGet } from '~/lib/api.server';
import { apiPaths } from '~/constants/api-paths';
import { requirePartner } from '~/features/partner/server/partner.server';

/**
 * Read path for the partner staff area ("Nhân sự" screen — Thành viên +
 * Lời mời tabs, Task 7). Unlike the tenant tier's `loadTenantMembers`, a
 * SINGLE permission (`partner.members.manage`) gates every route this screen
 * touches — `PartnerMemberController` declares it on every one of its
 * endpoints, and there is no partner-tier equivalent of `tenant.roles.manage`
 * splitting off a second tab — so `requirePartner` is called with that
 * permission directly and 403s outright rather than needing the tenant
 * loader's per-section `canManageMembers`/`canManageRoles` fallback.
 *
 * Members/invitations still each report their own fetch failure rather than
 * throwing — one dead endpoint must not blank the whole page (mirrors
 * `loadTenantMembers`). Since every caller who reaches this loader already
 * holds the one permission both lists need, there is no "not permitted to
 * see" case to distinguish from "fetched, zero rows" here, so a failed fetch
 * falls back to `[]` (not `null`) with its `*Error` field set.
 */
export async function loadPartnerMembers(request: Request) {
  const { auth, ctx } = await requirePartner(request, 'partner.members.manage');

  const [membersRes, invitationsRes] = await Promise.all([
    apiGet<PartnerMember[]>(apiPaths.partner.members, auth),
    apiGet<TenantInvitation[]>(apiPaths.partner.invitations, auth),
  ]);

  return {
    members: membersRes.ok ? (membersRes.data ?? []) : [],
    membersError: membersRes.ok ? null : (membersRes.error ?? 'Không tải được danh sách nhân sự.'),
    invitations: invitationsRes.ok ? (invitationsRes.data ?? []) : [],
    invitationsError: invitationsRes.ok ? null : (invitationsRes.error ?? 'Không tải được lời mời.'),
    // Plain string, never the live session object or a `can` function — React
    // Router 8's single-fetch wire format (turbo-stream) has no encoding for a
    // function value, so `loaderData.can(...)` would throw once hydration
    // swaps in the deserialized copy of this object (see
    // `loadTenantMembers`'s identical comment). The backend enforces
    // no-self-edit on its own (`CANNOT_EDIT_SELF`), but the UI must not offer
    // "Sửa vai trò"/"Gỡ khỏi đối tác" on the signed-in user's own row in the
    // first place — `MembersTable` compares this id against each row's
    // `userId`.
    currentUserId: ctx.user.userId,
  };
}
