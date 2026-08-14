import { data as routeData } from 'react-router';
import {
  createTenantRoleInputSchema,
  inviteTenantMemberInputSchema,
  setTenantMemberRolesInputSchema,
  updateTenantRoleInputSchema,
} from '@booking/contracts';
import { apiDelete, apiPatch, apiPost, apiPut } from '~/lib/api.server';
import { apiPaths } from '~/constants/api-paths';
import { actionMessages } from '~/constants/messages';
import { requireTenant } from '~/features/tenant/server/tenant.server';
import { domainErrorMessage } from '~/features/members/server/domain-error-message.server';

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
