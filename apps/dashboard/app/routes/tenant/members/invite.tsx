import { redirect } from 'react-router';
import type { RoleRef, TenantRoleDetail } from '@booking/contracts';
import type { Route } from './+types/invite';
import { apiGet, unwrapApiResult } from '~/lib/api.server';
import { apiPaths } from '~/constants/api-paths';
import { dashboardPaths } from '~/constants/paths';
import { requireTenant } from '~/features/tenant/server/tenant.server';
import { handleMembersAction } from '~/features/tenant/server/members-actions.server';
import { FormPage } from '~/components/form-page';
import { MemberForm } from '~/features/tenant/components/members/member-form';
import type { AssignableRole } from '~/features/tenant/components/members/role-multi-select';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Mời nhân sự · Tenant · BookingOS' }];
}

/**
 * Roles come from the `assignable` endpoint (`{id, name}`, gated only on
 * `tenant.members.manage` — see `list-assignable-tenant-roles.use-case.ts`,
 * built for exactly this form) so anyone who can invite staff can see every
 * role name to offer, even without `tenant.roles.manage`. The full
 * permission arrays needed for the effective-permission preview are a
 * second, best-effort fetch gated on that stronger permission; a caller
 * without it still gets a working invite form, just no permission preview
 * (see `PermissionPreview`'s `permissionsAvailable`).
 */
export async function loader({ request }: Route.LoaderArgs) {
  const { auth, can } = await requireTenant(request, 'tenant.members.manage');
  const canManageRoles = can('tenant.roles.manage');

  const [assignableRes, detailRes] = await Promise.all([
    apiGet<RoleRef[]>(apiPaths.tenant.rolesAssignable, auth),
    canManageRoles ? apiGet<TenantRoleDetail[]>(apiPaths.tenant.roles, auth) : Promise.resolve(null),
  ]);
  const assignableRoles = unwrapApiResult(assignableRes, 'Không tải được danh sách vai trò.');

  const permissionsById = new Map(
    (detailRes?.ok ? (detailRes.data ?? []) : []).map((role) => [role.id, role.permissions]),
  );
  const roles: AssignableRole[] = assignableRoles.map((role) => ({
    id: role.id,
    name: role.name,
    permissions: permissionsById.get(role.id) ?? [],
  }));

  return { roles, canManageRoles };
}

/**
 * Shared with the "Nhân sự" tabs and the inline role creator's own fetcher —
 * only a successful `invite` (the main form submission) redirects; a
 * `create-role` success (the inline creator, submitted via its own fetcher)
 * falls through unchanged so it lands on that fetcher's `data`, not here.
 */
export async function action({ request }: Route.ActionArgs) {
  const result = await handleMembersAction({ request });
  if ('ok' in result && result.ok && 'intent' in result && result.intent === 'invite') {
    return redirect(dashboardPaths.tenant.membersSection('invitations'));
  }
  return result;
}

export default function InviteMember({ loaderData, actionData }: Route.ComponentProps) {
  const serverError = actionData && 'error' in actionData ? (actionData.error ?? null) : null;
  const fieldErrors = actionData && 'fieldErrors' in actionData ? (actionData.fieldErrors ?? null) : null;

  return (
    <FormPage
      backTo={dashboardPaths.tenant.members}
      backLabel="Nhân sự"
      title="Mời nhân sự"
      description="Gửi lời mời tham gia bảng điều khiển của tenant kèm một hoặc nhiều vai trò."
    >
      <MemberForm
        mode="invite"
        roles={loaderData.roles}
        canCreateRole={loaderData.canManageRoles}
        serverError={serverError}
        fieldErrors={fieldErrors}
      />
    </FormPage>
  );
}
