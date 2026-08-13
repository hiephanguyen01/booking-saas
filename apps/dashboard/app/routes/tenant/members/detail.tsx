import { redirect } from 'react-router';
import type { RoleRef, TenantMember, TenantRoleDetail } from '@booking/contracts';
import type { Route } from './+types/detail';
import { apiGet, unwrapApiResult } from '~/lib/api.server';
import { apiPaths } from '~/constants/api-paths';
import { dashboardPaths } from '~/constants/paths';
import { notFoundMessages } from '~/constants/messages';
import { requireTenant } from '~/features/tenant/server/tenant.server';
import { handleMembersAction } from '~/features/tenant/server/members-actions.server';
import { FormPage } from '~/components/form-page';
import { MemberForm } from '~/features/tenant/components/members/member-form';
import type { AssignableRole } from '~/features/tenant/components/members/role-multi-select';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Sửa vai trò thành viên · Tenant · BookingOS' }];
}

/**
 * There is no `GET /tenant/members/:userId` — the member endpoints only
 * offer list + roles-PUT + remove-DELETE — so the member is found in the
 * same list `MembersTable` renders. Roles are fetched the same way
 * `invite.tsx` does: see that file's comment for why the role list and its
 * permission arrays come from two separately gated calls.
 */
export async function loader({ request, params }: Route.LoaderArgs) {
  const { auth, can } = await requireTenant(request, 'tenant.members.manage');
  const canManageRoles = can('tenant.roles.manage');

  const [membersRes, assignableRes, detailRes] = await Promise.all([
    apiGet<TenantMember[]>(apiPaths.tenant.members, auth),
    apiGet<RoleRef[]>(apiPaths.tenant.rolesAssignable, auth),
    canManageRoles ? apiGet<TenantRoleDetail[]>(apiPaths.tenant.roles, auth) : Promise.resolve(null),
  ]);

  const members = unwrapApiResult(membersRes, 'Không tải được danh sách nhân sự.');
  const member = members.find((item) => item.userId === params.userId);
  if (!member) {
    throw new Response(notFoundMessages.member, { status: 404 });
  }

  const assignableRoles = unwrapApiResult(assignableRes, 'Không tải được danh sách vai trò.');
  const permissionsById = new Map(
    (detailRes?.ok ? (detailRes.data ?? []) : []).map((role) => [role.id, role.permissions]),
  );
  const roles: AssignableRole[] = assignableRoles.map((role) => ({
    id: role.id,
    name: role.name,
    permissions: permissionsById.get(role.id) ?? [],
  }));

  return { member, roles, canManageRoles };
}

/** Only a successful `set-roles` (the main form) redirects — see `invite.tsx`. */
export async function action({ request }: Route.ActionArgs) {
  const result = await handleMembersAction({ request });
  if ('ok' in result && result.ok && 'intent' in result && result.intent === 'set-roles') {
    return redirect(dashboardPaths.tenant.members);
  }
  return result;
}

export default function EditMember({ loaderData, actionData }: Route.ComponentProps) {
  const serverError = actionData && 'error' in actionData ? (actionData.error ?? null) : null;
  const fieldErrors = actionData && 'fieldErrors' in actionData ? (actionData.fieldErrors ?? null) : null;

  return (
    <FormPage
      backTo={dashboardPaths.tenant.members}
      backLabel="Nhân sự"
      title="Sửa vai trò thành viên"
      description={loaderData.member.fullName}
    >
      <MemberForm
        mode="edit"
        member={loaderData.member}
        roles={loaderData.roles}
        canCreateRole={loaderData.canManageRoles}
        serverError={serverError}
        fieldErrors={fieldErrors}
      />
    </FormPage>
  );
}
