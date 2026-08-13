import { redirect } from 'react-router';
import type { TenantRoleDetail } from '@booking/contracts';
import type { Route } from './+types/edit';
import { apiGet, unwrapApiResult } from '~/lib/api.server';
import { apiPaths } from '~/constants/api-paths';
import { dashboardPaths } from '~/constants/paths';
import { notFoundMessages } from '~/constants/messages';
import { requireTenant } from '~/features/tenant/server/tenant.server';
import { handleMembersAction } from '~/features/tenant/server/members-actions.server';
import { FormPage } from '~/components/form-page';
import { RoleForm } from '~/features/tenant/components/members/role-form';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Sửa vai trò · Tenant · BookingOS' }];
}

/**
 * There is no `GET /tenant/roles/:roleId` — the role endpoints only offer
 * list + POST + PATCH + DELETE (`tenant-role.controller.ts`) — so the role is
 * found in the same list `RolesTable` renders, the same way
 * `members/detail.tsx` finds one member in the full members list.
 */
export async function loader({ request, params }: Route.LoaderArgs) {
  const { auth } = await requireTenant(request, 'tenant.roles.manage');
  const res = await apiGet<TenantRoleDetail[]>(apiPaths.tenant.roles, auth);
  const roles = unwrapApiResult(res, 'Không tải được danh sách vai trò.');
  const role = roles.find((item) => item.id === params.roleId);
  if (!role) {
    throw new Response(notFoundMessages.role, { status: 404 });
  }
  return { role };
}

/**
 * Only a successful `update-role` (the main form) redirects — see
 * `roles/new.tsx`'s comment on why `handleMembersAction`'s other intents fall
 * through unchanged. A system role never posts here (its screen renders
 * `RoleForm mode="view"`, which has no form), so this branch only ever fires
 * for a custom role's edit.
 */
export async function action({ request }: Route.ActionArgs) {
  const result = await handleMembersAction({ request });
  if ('ok' in result && result.ok && 'intent' in result && result.intent === 'update-role') {
    return redirect(dashboardPaths.tenant.membersSection('roles'));
  }
  return result;
}

export default function EditTenantRole({ loaderData, actionData }: Route.ComponentProps) {
  const { role } = loaderData;
  const serverError = actionData && 'error' in actionData ? (actionData.error ?? null) : null;
  const fieldErrors = actionData && 'fieldErrors' in actionData ? (actionData.fieldErrors ?? null) : null;

  return (
    <FormPage
      backTo={dashboardPaths.tenant.membersSection('roles')}
      backLabel="Vai trò"
      title={role.isSystem ? 'Vai trò hệ thống' : 'Sửa vai trò'}
      description={role.name}
    >
      {role.isSystem ? (
        <RoleForm mode="view" role={role} />
      ) : (
        <RoleForm mode="edit" role={role} serverError={serverError} fieldErrors={fieldErrors} />
      )}
    </FormPage>
  );
}
