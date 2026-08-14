import { redirect } from 'react-router';
import type { PartnerRoleRef } from '@booking/contracts';
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
 * Roles come from `GET /partner/roles/assignable` (`{id, name, permissions}`,
 * gated on `partner.members.manage` — see
 * `list-assignable-partner-roles.use-case.ts`, the partner-tier mirror of the
 * tenant tier's own assignable-roles route). Unlike the tenant tier, this
 * tier has no `partner.roles.manage`-gated detail endpoint (no such route
 * exists — there is no partner role-management screen), so this one call is
 * the only source of a role's permission set, and carries it directly.
 * `MemberForm` is always called with `canCreateRole={false}` here (no inline
 * role creator on this tier) but `tier="partner"`, so `PermissionPreview`
 * still renders the real permission breakdown.
 */
export async function loader({ request }: Route.LoaderArgs) {
  const { auth } = await requirePartner(request, 'partner.members.manage');
  const assignableRes = await apiGet<PartnerRoleRef[]>(apiPaths.partner.rolesAssignable, auth);
  const assignableRoles = unwrapApiResult(assignableRes, 'Không tải được danh sách vai trò.');
  const roles: AssignableRole[] = assignableRoles.map((role) => ({
    id: role.id,
    name: role.name,
    permissions: role.permissions,
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
        tier="partner"
        roles={loaderData.roles}
        canCreateRole={false}
        scopeLabel="đối tác"
        serverError={serverError}
        fieldErrors={fieldErrors}
      />
    </FormPage>
  );
}
