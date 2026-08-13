import { redirect } from 'react-router';
import type { TenantRoleDetail } from '@booking/contracts';
import type { Route } from './+types/new';
import { apiGet } from '~/lib/api.server';
import { apiPaths } from '~/constants/api-paths';
import { dashboardPaths } from '~/constants/paths';
import { requireTenant } from '~/features/tenant/server/tenant.server';
import { handleMembersAction } from '~/features/tenant/server/members-actions.server';
import { FormPage } from '~/components/form-page';
import { RoleForm } from '~/features/tenant/components/members/role-form';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Vai trò mới · Tenant · BookingOS' }];
}

/**
 * `?from=<roleId>` is "Nhân bản": `roles-table.tsx`'s row action for a system
 * role, and `RoleForm`'s own "Nhân bản" button when viewing one, both link
 * here via `dashboardPaths.tenant.roleNewFrom`. There is no `GET
 * /tenant/roles/:id`, so the source role is found in the full list (same
 * pattern `roles/edit.tsx` uses) — a stale/unknown id just falls back to a
 * blank form rather than failing the page, since this is a convenience
 * pre-fill, not a required parameter.
 */
export async function loader({ request }: Route.LoaderArgs) {
  const { auth } = await requireTenant(request, 'tenant.roles.manage');
  const fromRoleId = new URL(request.url).searchParams.get('from');
  if (!fromRoleId) return { duplicateFrom: null };

  const res = await apiGet<TenantRoleDetail[]>(apiPaths.tenant.roles, auth);
  const source = res.ok ? (res.data ?? []).find((role) => role.id === fromRoleId) : undefined;
  if (!source) return { duplicateFrom: null };

  return {
    duplicateFrom: {
      sourceName: source.name,
      name: `${source.name} (bản sao)`,
      permissions: source.permissions,
    },
  };
}

/** Only a successful `create-role` (the main form) redirects — `handleMembersAction` is
 *  shared with the "Vai trò" tab's delete action and the invite screen's inline creator,
 *  neither of which should navigate away from here. */
export async function action({ request }: Route.ActionArgs) {
  const result = await handleMembersAction({ request });
  if ('ok' in result && result.ok && 'intent' in result && result.intent === 'create-role') {
    return redirect(dashboardPaths.tenant.membersSection('roles'));
  }
  return result;
}

export default function NewTenantRole({ loaderData, actionData }: Route.ComponentProps) {
  const { duplicateFrom } = loaderData;
  const serverError = actionData && 'error' in actionData ? (actionData.error ?? null) : null;
  const fieldErrors = actionData && 'fieldErrors' in actionData ? (actionData.fieldErrors ?? null) : null;

  return (
    <FormPage
      backTo={dashboardPaths.tenant.membersSection('roles')}
      backLabel="Vai trò"
      title="Tạo vai trò mới"
      description="Đặt tên và chọn các quyền vai trò này cấp cho thành viên được gán."
      banner={
        duplicateFrom ? (
          <div className="rounded-lg border bg-muted/15 px-4 py-3 text-sm text-muted-foreground">
            Đã điền sẵn quyền từ vai trò “{duplicateFrom.sourceName}” — đặt một tên khác trước khi lưu.
          </div>
        ) : null
      }
    >
      <RoleForm
        mode="create"
        initialName={duplicateFrom?.name}
        initialPermissions={duplicateFrom?.permissions}
        serverError={serverError}
        fieldErrors={fieldErrors}
      />
    </FormPage>
  );
}
