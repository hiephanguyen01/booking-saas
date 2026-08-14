import { redirect } from 'react-router';
import type { RoleRef } from '@booking/contracts';
import type { Route } from './+types/invite';
import { apiGet, unwrapApiResult } from '~/lib/api.server';
import { apiPaths } from '~/constants/api-paths';
import { dashboardPaths } from '~/constants/paths';
import { requirePartner } from '~/features/partner/server/partner.server';
import { handlePartnerMembersAction } from '~/features/partner/server/members-actions.server';
import { FormPage } from '~/components/form-page';
import { MemberForm } from '~/features/tenant/components/members/member-form';
import type { AssignableRole } from '~/features/tenant/components/members/role-multi-select';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Mời nhân sự · Đối tác · BookingOS' }];
}

/**
 * Roles come from `GET /partner/roles/assignable` (`{id, name}`, gated on
 * `partner.members.manage` — see `list-assignable-partner-roles.use-case.ts`,
 * the partner-tier mirror of the tenant tier's own assignable-roles route).
 * This tier has no `partner.roles.manage`-gated detail endpoint returning
 * each role's permission set (no such route exists — there is no partner
 * role-management screen), so every role's `permissions` is seeded empty.
 * `MemberForm` is always called with `canCreateRole={false}` here, so
 * `PermissionPreview` never actually reads those arrays — it shows its
 * "cần quyền Quản lý vai trò" fallback instead — but the picker still lists
 * every role name to choose from.
 */
export async function loader({ request }: Route.LoaderArgs) {
  const { auth } = await requirePartner(request, 'partner.members.manage');
  const assignableRes = await apiGet<RoleRef[]>(apiPaths.partner.rolesAssignable, auth);
  const assignableRoles = unwrapApiResult(assignableRes, 'Không tải được danh sách vai trò.');
  const roles: AssignableRole[] = assignableRoles.map((role) => ({
    id: role.id,
    name: role.name,
    permissions: [],
  }));
  return { roles };
}

/** Only a successful `invite` redirects — mirrors the tenant tier's `invite.tsx`. */
export async function action({ request }: Route.ActionArgs) {
  const result = await handlePartnerMembersAction({ request });
  if ('ok' in result && result.ok && 'intent' in result && result.intent === 'invite') {
    return redirect(dashboardPaths.partner.membersSection('invitations'));
  }
  return result;
}

export default function InvitePartnerMember({ loaderData, actionData }: Route.ComponentProps) {
  const serverError = actionData && 'error' in actionData ? (actionData.error ?? null) : null;
  const fieldErrors = actionData && 'fieldErrors' in actionData ? (actionData.fieldErrors ?? null) : null;

  return (
    <FormPage
      backTo={dashboardPaths.partner.members}
      backLabel="Nhân sự"
      title="Mời nhân sự"
      description="Gửi lời mời tham gia bảng điều khiển của đối tác kèm một hoặc nhiều vai trò."
    >
      <MemberForm
        mode="invite"
        roles={loaderData.roles}
        canCreateRole={false}
        scopeLabel="đối tác"
        serverError={serverError}
        fieldErrors={fieldErrors}
      />
    </FormPage>
  );
}
