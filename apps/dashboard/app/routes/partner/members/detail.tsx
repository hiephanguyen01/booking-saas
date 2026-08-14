import { redirect } from 'react-router';
import type { PartnerMember, RoleRef } from '@booking/contracts';
import type { Route } from './+types/detail';
import { apiGet, unwrapApiResult } from '~/lib/api.server';
import { apiPaths } from '~/constants/api-paths';
import { dashboardPaths } from '~/constants/paths';
import { notFoundMessages } from '~/constants/messages';
import { requirePartner } from '~/features/partner/server/partner.server';
import { handlePartnerMembersAction } from '~/features/partner/server/members-actions.server';
import { FormPage } from '~/components/form-page';
import { MemberForm } from '~/features/tenant/components/members/member-form';
import type { AssignableRole } from '~/features/tenant/components/members/role-multi-select';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Sửa vai trò thành viên · Đối tác · BookingOS' }];
}

/**
 * There is no `GET /partner/members/:userId` — same shape as the tenant
 * tier's `detail.tsx` — so the member is found in the same list
 * `MembersTable` renders. See `invite.tsx` for why every assignable role's
 * `permissions` is seeded empty here.
 */
export async function loader({ request, params }: Route.LoaderArgs) {
  const { auth } = await requirePartner(request, 'partner.members.manage');

  const [membersRes, assignableRes] = await Promise.all([
    apiGet<PartnerMember[]>(apiPaths.partner.members, auth),
    apiGet<RoleRef[]>(apiPaths.partner.rolesAssignable, auth),
  ]);

  const members = unwrapApiResult(membersRes, 'Không tải được danh sách nhân sự.');
  const member = members.find((item) => item.userId === params.userId);
  if (!member) {
    throw new Response(notFoundMessages.member, { status: 404 });
  }

  const assignableRoles = unwrapApiResult(assignableRes, 'Không tải được danh sách vai trò.');
  const roles: AssignableRole[] = assignableRoles.map((role) => ({
    id: role.id,
    name: role.name,
    permissions: [],
  }));

  return { member, roles };
}

/** Only a successful `set-roles` redirects — mirrors the tenant tier's `detail.tsx`. */
export async function action({ request }: Route.ActionArgs) {
  const result = await handlePartnerMembersAction({ request });
  if ('ok' in result && result.ok && 'intent' in result && result.intent === 'set-roles') {
    return redirect(dashboardPaths.partner.members);
  }
  return result;
}

export default function EditPartnerMember({ loaderData, actionData }: Route.ComponentProps) {
  const serverError = actionData && 'error' in actionData ? (actionData.error ?? null) : null;
  const fieldErrors = actionData && 'fieldErrors' in actionData ? (actionData.fieldErrors ?? null) : null;

  return (
    <FormPage
      backTo={dashboardPaths.partner.members}
      backLabel="Nhân sự"
      title="Sửa vai trò thành viên"
      description={loaderData.member.fullName}
    >
      <MemberForm
        mode="edit"
        member={loaderData.member}
        roles={loaderData.roles}
        canCreateRole={false}
        serverError={serverError}
        fieldErrors={fieldErrors}
      />
    </FormPage>
  );
}
