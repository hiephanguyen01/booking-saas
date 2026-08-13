import { data as routeData } from 'react-router';
import {
  createTenantRoleInputSchema,
  inviteTenantMemberInputSchema,
  setTenantMemberRolesInputSchema,
  updateTenantRoleInputSchema,
} from '@booking/contracts';
import type { ApiResult } from '~/lib/api.server';
import { apiDelete, apiPatch, apiPost, apiPut } from '~/lib/api.server';
import { apiPaths } from '~/constants/api-paths';
import { actionMessages } from '~/constants/messages';
import { requireTenant } from '~/features/tenant/server/tenant.server';

/**
 * Vietnamese copy for the backend `DomainError` codes the tenant staff area's
 * seven write intents (invite, set-roles, create-role, update-role,
 * revoke-invitation, remove-member, delete-role) can come back with. A raw
 * `res.error` is `DomainError.message` straight from the backend — English —
 * which is unreadable on this Vietnamese-hardcoded screen, so every intent's
 * failure branch runs its result through this ONE table rather than each
 * growing its own. Several codes are only reachable from more than one
 * intent (`LAST_MANAGER_REMOVED` from `update-role`, `set-roles` and
 * `remove-member`; `ROLE_NOT_FOUND` from `invite`, `set-roles` and
 * `update-role`), so a per-intent copy would have had to repeat itself or
 * drift.
 *
 *  - `LAST_MANAGER_REMOVED` (409): the write would strip `tenant.members.manage`
 *    from the last person who holds it — the tenant would lock itself out of
 *    its own staff/role management. The operator needs to understand *that*
 *    consequence, not see a generic "save failed".
 *  - `SYSTEM_ROLE_IMMUTABLE` (409): defensive only — no form in this area ever
 *    targets a system role (Task 13's `RoleForm` `mode="view"`), so this is
 *    normally unreachable, but a stale tab or a direct POST should still get
 *    a readable answer instead of the raw English message.
 *  - `ROLE_IN_USE` (409, delete-role only): `roles-table.tsx` already disables
 *    "Xóa" once `memberCount > 0`, so this should be rare — a member joined
 *    the role between page load and this click — but when the backend does
 *    refuse (the FK cascade would otherwise silently strip every holder), the
 *    operator sees exactly how many people are affected, read from the
 *    error's `details.memberCount`, never a raw English sentence.
 *  - `CANNOT_EDIT_SELF` (409, set-roles/remove-member): the signed-in user's
 *    own row hides these actions (`members-table.tsx`), so this is normally
 *    unreachable too — same defensive reasoning as `SYSTEM_ROLE_IMMUTABLE`.
 *  - `PERMISSION_ESCALATION` (400, invite/set-roles): the caller tried to
 *    grant a permission they do not themselves hold.
 *  - `INVITATION_ALREADY_PENDING` (409, invite): the email already has an
 *    unexpired, unrevoked invitation outstanding.
 *  - `ROLE_NOT_FOUND` / `MEMBER_NOT_FOUND` / `INVITATION_NOT_PENDING` (404/409):
 *    the target row was deleted, removed, or resolved by someone else between
 *    page load and this submit.
 *
 * A code with no case here (or no `res.code` at all — a network/transport
 * failure) falls back to `fallback`, which is always a readable Vietnamese
 * sentence, never a blank.
 */
function domainErrorMessage(res: ApiResult<unknown>, fallback: string): string {
  switch (res.code) {
    case 'LAST_MANAGER_REMOVED':
      return 'Không thể lưu — thao tác này sẽ gỡ quyền "Quản lý nhân sự" khỏi người cuối cùng còn giữ quyền đó, khiến tenant mất khả năng tự quản lý nhân sự. Hãy giữ lại quyền này cho ít nhất một người.';
    case 'SYSTEM_ROLE_IMMUTABLE':
      return 'Vai trò hệ thống không thể chỉnh sửa hoặc xoá.';
    case 'ROLE_IN_USE': {
      const memberCount = res.details?.memberCount;
      return typeof memberCount === 'number'
        ? `Không thể xoá — vai trò này đang được ${memberCount} thành viên sử dụng. Hãy gỡ vai trò khỏi họ trước.`
        : 'Không thể xoá — vai trò này vẫn đang được thành viên sử dụng.';
    }
    case 'CANNOT_EDIT_SELF':
      return 'Bạn không thể tự sửa vai trò hoặc tự gỡ chính mình khỏi tenant.';
    case 'PERMISSION_ESCALATION':
      return 'Bạn không thể cấp quyền mà chính mình không có.';
    case 'INVITATION_ALREADY_PENDING':
      return 'Địa chỉ email này đã có một lời mời đang chờ xử lý.';
    case 'ROLE_NOT_FOUND':
      return 'Không tìm thấy vai trò này — có thể đã bị xoá.';
    case 'MEMBER_NOT_FOUND':
      return 'Không tìm thấy thành viên này — có thể đã bị gỡ khỏi tenant.';
    case 'INVITATION_NOT_PENDING':
      return 'Lời mời này không còn hiệu lực.';
    default:
      return res.error ?? fallback;
  }
}

/**
 * The tenant staff area's multi-intent action ("Nhân sự" + "Vai trò" tabs).
 * Every screen in that area delegates here, the same way the settings screen's
 * tabs share `handleSettingsAction` — one dispatcher keeps the write paths in
 * one place while each route module stays focused on composition.
 *
 * `requireTenant` is called with no permission: the seven intents split across
 * two different backend permissions (`tenant.members.manage` for staff and
 * invitations, `tenant.roles.manage` for role CRUD — see
 * `tenant-member.controller.ts` / `tenant-role.controller.ts`), so a single
 * upfront permission would wrongly gate the other half. The backend's own
 * `@RequirePermissions` on each endpoint is the real enforcement; a caller
 * lacking it gets that endpoint's error surfaced through the same failure
 * branch below (the UI itself never offers an intent the signed-in member
 * cannot see, via `loadTenantMembers`'s precomputed `canManageMembers`/
 * `canManageRoles` booleans).
 *
 * GenericForm intents (`invite`, `set-roles`, `create-role`, `update-role`)
 * submit JSON and are re-validated with the matching Task 1 schema; the
 * plain single-button intents (`revoke-invitation`, `remove-member`,
 * `delete-role`) submit FormData, mirroring `handleSettingsAction`'s split.
 */
export async function handleMembersAction({ request }: { request: Request }) {
  const { auth } = await requireTenant(request);
  const contentType = request.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    const body: unknown = await request.json();
    const intent =
      body && typeof body === 'object' && 'intent' in body
        ? String((body as { intent?: unknown }).intent ?? '')
        : '';

    if (intent === 'invite') {
      const parsed = inviteTenantMemberInputSchema.safeParse(body);
      if (!parsed.success) {
        return routeData(
          { error: null, fieldErrors: parsed.error.flatten().fieldErrors },
          { status: 400 },
        );
      }
      const res = await apiPost(apiPaths.tenant.invitations, parsed.data, auth);
      if (!res.ok) {
        return routeData(
          {
            error: domainErrorMessage(res, 'Không gửi được lời mời.'),
            fieldErrors: res.errors ?? null,
          },
          { status: 400 },
        );
      }
      return { intent, ok: true };
    }

    if (intent === 'set-roles') {
      const userId = String((body as { userId?: unknown }).userId ?? '');
      const parsed = setTenantMemberRolesInputSchema.safeParse(body);
      if (!parsed.success) {
        return routeData(
          { error: null, fieldErrors: parsed.error.flatten().fieldErrors },
          { status: 400 },
        );
      }
      const res = await apiPut(apiPaths.tenant.memberRoles(userId), parsed.data, auth);
      if (!res.ok) {
        return routeData(
          {
            error: domainErrorMessage(res, 'Không cập nhật được vai trò.'),
            fieldErrors: res.errors ?? null,
          },
          { status: 400 },
        );
      }
      return { intent, ok: true };
    }

    if (intent === 'create-role') {
      const parsed = createTenantRoleInputSchema.safeParse(body);
      if (!parsed.success) {
        return routeData(
          { error: null, fieldErrors: parsed.error.flatten().fieldErrors },
          { status: 400 },
        );
      }
      const res = await apiPost<{ id: string }>(apiPaths.tenant.roles, parsed.data, auth);
      if (!res.ok) {
        return routeData(
          {
            error: domainErrorMessage(res, 'Không tạo được vai trò.'),
            fieldErrors: res.errors ?? null,
          },
          { status: 400 },
        );
      }
      return { intent, ok: true, roleId: res.data?.id ?? null };
    }

    if (intent === 'update-role') {
      const roleId = String((body as { roleId?: unknown }).roleId ?? '');
      const parsed = updateTenantRoleInputSchema.safeParse(body);
      if (!parsed.success) {
        return routeData(
          { error: null, fieldErrors: parsed.error.flatten().fieldErrors },
          { status: 400 },
        );
      }
      const res = await apiPatch(apiPaths.tenant.role(roleId), parsed.data, auth);
      if (!res.ok) {
        return routeData(
          {
            error: domainErrorMessage(res, 'Không lưu được vai trò.'),
            fieldErrors: res.errors ?? null,
          },
          { status: 400 },
        );
      }
      return { intent, ok: true };
    }

    return routeData({ error: actionMessages.invalidIntent }, { status: 400 });
  }

  const formData = await request.formData();
  const intent = String(formData.get('intent') ?? '');

  if (intent === 'revoke-invitation') {
    const id = String(formData.get('invitationId') ?? '');
    const res = await apiDelete(apiPaths.tenant.invitation(id), auth);
    if (!res.ok) {
      return routeData({ error: domainErrorMessage(res, 'Không huỷ được lời mời.') }, { status: 400 });
    }
    return { intent, ok: true };
  }

  if (intent === 'remove-member') {
    const userId = String(formData.get('userId') ?? '');
    const res = await apiDelete(apiPaths.tenant.member(userId), auth);
    if (!res.ok) {
      return routeData(
        { error: domainErrorMessage(res, 'Không xoá được thành viên.') },
        { status: 400 },
      );
    }
    return { intent, ok: true };
  }

  if (intent === 'delete-role') {
    const roleId = String(formData.get('roleId') ?? '');
    const res = await apiDelete(apiPaths.tenant.role(roleId), auth);
    if (!res.ok) {
      return routeData({ error: domainErrorMessage(res, 'Không xoá được vai trò.') }, { status: 400 });
    }
    return { intent, ok: true };
  }

  return routeData({ error: actionMessages.invalidIntent }, { status: 400 });
}
