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
 * `update-role`'s failure copy. The backend refuses two write-path invariants
 * a raw `res.error` (English, `DomainError.message`) would explain poorly:
 *
 *  - `LAST_MANAGER_REMOVED` (409): the edit would strip `tenant.members.manage`
 *    from the last person who holds it — the tenant would lock itself out of
 *    its own staff/role management. The operator needs to understand *that*
 *    consequence, not see a generic "save failed".
 *  - `SYSTEM_ROLE_IMMUTABLE` (409): defensive only — the edit screen never
 *    renders a form for a system role (Task 13's `RoleForm` `mode="view"`), so
 *    this path is normally unreachable, but a stale tab or a direct POST
 *    should still get a readable answer instead of the raw English message.
 */
function updateRoleErrorMessage(res: ApiResult<unknown>): string {
  if (res.code === 'LAST_MANAGER_REMOVED') {
    return 'Không thể lưu — thao tác này sẽ gỡ quyền "Quản lý nhân sự" khỏi người cuối cùng còn giữ quyền đó, khiến tenant mất khả năng tự quản lý nhân sự. Hãy giữ lại quyền này cho ít nhất một người.';
  }
  if (res.code === 'SYSTEM_ROLE_IMMUTABLE') {
    return 'Vai trò hệ thống không thể chỉnh sửa.';
  }
  return res.error ?? 'Không lưu được vai trò.';
}

/**
 * `delete-role`'s failure copy. `roles-table.tsx` already disables "Xóa" once
 * `memberCount > 0`, so `ROLE_IN_USE` (409) should be rare in practice — a
 * member joined the role between page load and this click — but when the
 * backend does refuse (the FK cascade would otherwise silently strip every
 * holder), the operator sees exactly how many people are affected, read from
 * the error's `details.memberCount` rather than a raw English sentence.
 */
function deleteRoleErrorMessage(res: ApiResult<unknown>): string {
  if (res.code === 'ROLE_IN_USE') {
    const memberCount = res.details?.memberCount;
    return typeof memberCount === 'number'
      ? `Không thể xoá — vai trò này đang được ${memberCount} thành viên sử dụng. Hãy gỡ vai trò khỏi họ trước.`
      : 'Không thể xoá — vai trò này vẫn đang được thành viên sử dụng.';
  }
  if (res.code === 'SYSTEM_ROLE_IMMUTABLE') {
    return 'Vai trò hệ thống không thể xoá.';
  }
  return res.error ?? 'Không xoá được vai trò.';
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
 * cannot see, via `loadTenantMembers`'s `can`).
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
          { error: res.error ?? 'Không gửi được lời mời.', fieldErrors: res.errors ?? null },
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
          { error: res.error ?? 'Không cập nhật được vai trò.', fieldErrors: res.errors ?? null },
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
          { error: res.error ?? 'Không tạo được vai trò.', fieldErrors: res.errors ?? null },
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
          { error: updateRoleErrorMessage(res), fieldErrors: res.errors ?? null },
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
      return routeData({ error: res.error ?? 'Không huỷ được lời mời.' }, { status: 400 });
    }
    return { intent, ok: true };
  }

  if (intent === 'remove-member') {
    const userId = String(formData.get('userId') ?? '');
    const res = await apiDelete(apiPaths.tenant.member(userId), auth);
    if (!res.ok) {
      return routeData({ error: res.error ?? 'Không xoá được thành viên.' }, { status: 400 });
    }
    return { intent, ok: true };
  }

  if (intent === 'delete-role') {
    const roleId = String(formData.get('roleId') ?? '');
    const res = await apiDelete(apiPaths.tenant.role(roleId), auth);
    if (!res.ok) {
      return routeData({ error: deleteRoleErrorMessage(res) }, { status: 400 });
    }
    return { intent, ok: true };
  }

  return routeData({ error: actionMessages.invalidIntent }, { status: 400 });
}
