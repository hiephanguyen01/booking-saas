import type { ReactNode } from 'react';
import { useState } from 'react';
import {
  inviteTenantMemberInputSchema,
  setTenantMemberRolesInputSchema,
  type InviteTenantMemberInput,
  type TenantMember,
} from '@booking/contracts';
import { GenericForm } from '@booking/ui/components/form/generic-form';
import { Controller } from '@booking/ui/components/form/rhf';
import type { FieldConfig } from '@booking/ui/components/form/types';
import { Eye, Mail, ShieldCheck } from 'lucide-react';
import { DateTimeValue } from '~/components/date-time-value';
import { fieldNode, FORM_ACTIONS_ROW, FormSurface, Section } from '~/components/form-layout';
import { InlineRoleCreator } from './inline-role-creator';
import { PermissionPreview } from './permission-preview';
import { RoleMultiSelect, type AssignableRole } from './role-multi-select';

const inviteFields: FieldConfig<InviteTenantMemberInput>[] = [
  {
    name: 'email',
    type: 'email',
    label: 'Email',
    placeholder: 'nhanvien@example.com',
    colSpan: 2,
  },
];

type MemberFormProps =
  | {
      mode: 'invite';
      roles: AssignableRole[];
      canCreateRole: boolean;
      serverError?: string | null;
      fieldErrors?: Record<string, string[]> | null;
    }
  | {
      mode: 'edit';
      roles: AssignableRole[];
      canCreateRole: boolean;
      /** The member whose roles this screen re-assigns. Not editable here. */
      member: TenantMember;
      serverError?: string | null;
      fieldErrors?: Record<string, string[]> | null;
    };

/**
 * Invite-a-member and edit-a-member's-roles share this one component —
 * `mode` switches the schema, default values, and the identity section's
 * body, never a second copy of the section layout (apps/dashboard/CLAUDE.md
 * "Full-page forms"). `roles` seeds local state so a role created inline via
 * `InlineRoleCreator` shows up in the picker and the preview immediately,
 * with no refetch.
 */
export function MemberForm(props: MemberFormProps) {
  const { mode, roles: initialRoles, canCreateRole, serverError, fieldErrors } = props;
  const [roles, setRoles] = useState(initialRoles);

  if (mode === 'edit') {
    const { member } = props;
    return (
      <GenericForm
        schema={setTenantMemberRolesInputSchema}
        fields={[]}
        defaultValues={{ roleIds: member.roles.map((role) => role.id) }}
        submitLabel="Lưu vai trò"
        submitPendingLabel="Đang lưu..."
        serverError={serverError}
        fieldErrors={fieldErrors}
        actionsClassName={FORM_ACTIONS_ROW}
        warnOnUnsavedChanges
        renderFields={(_fields, _values, form) => (
          <Controller
            control={form.control}
            name="roleIds"
            render={({ field, fieldState }) => (
              <MemberFormSections
                mode="edit"
                member={member}
                roles={roles}
                roleIds={field.value ?? []}
                onRoleIdsChange={field.onChange}
                roleIdsError={fieldState.error?.message ? [fieldState.error.message] : undefined}
                canCreateRole={canCreateRole}
                onRoleCreated={(role) => {
                  setRoles((previous) => [...previous, role]);
                  field.onChange([...(field.value ?? []), role.id]);
                }}
              />
            )}
          />
        )}
        transform={(data) => ({
          intent: 'set-roles',
          userId: member.userId,
          roleIds: data.roleIds,
        })}
      />
    );
  }

  return (
    <GenericForm
      schema={inviteTenantMemberInputSchema}
      fields={inviteFields}
      defaultValues={{ email: '', roleIds: [] }}
      submitLabel="Gửi lời mời"
      submitPendingLabel="Đang gửi..."
      serverError={serverError}
      fieldErrors={fieldErrors}
      actionsClassName={FORM_ACTIONS_ROW}
      warnOnUnsavedChanges
      renderFields={(renderedFields, _values, form) => (
        <Controller
          control={form.control}
          name="roleIds"
          render={({ field, fieldState }) => (
            <MemberFormSections
              mode="invite"
              emailNode={fieldNode(renderedFields, 'email')}
              roles={roles}
              roleIds={field.value ?? []}
              onRoleIdsChange={field.onChange}
              roleIdsError={fieldState.error?.message ? [fieldState.error.message] : undefined}
              canCreateRole={canCreateRole}
              onRoleCreated={(role) => {
                setRoles((previous) => [...previous, role]);
                field.onChange([...(field.value ?? []), role.id]);
              }}
            />
          )}
        />
      )}
      transform={(data) => ({ intent: 'invite', email: data.email, roleIds: data.roleIds })}
    />
  );
}

/**
 * The three section bodies both modes render: member identity, role
 * selection (+ the inline role creator when allowed), and the effective
 * permission preview. `mode` only ever changes what section one shows.
 */
function MemberFormSections({
  mode,
  member,
  emailNode,
  roles,
  roleIds,
  onRoleIdsChange,
  roleIdsError,
  canCreateRole,
  onRoleCreated,
}: {
  mode: 'invite' | 'edit';
  member?: TenantMember;
  emailNode?: ReactNode;
  roles: AssignableRole[];
  roleIds: string[];
  onRoleIdsChange: (next: string[]) => void;
  roleIdsError?: string[];
  canCreateRole: boolean;
  onRoleCreated: (role: AssignableRole) => void;
}) {
  return (
    <FormSurface>
      <Section
        title="Thông tin thành viên"
        description={
          mode === 'invite'
            ? 'Email nhận lời mời tham gia bảng điều khiển của tenant.'
            : 'Thông tin liên hệ của thành viên — không thể chỉnh sửa tại đây.'
        }
        icon={<Mail aria-hidden />}
      >
        {mode === 'invite' ? (
          emailNode
        ) : (
          <div className="space-y-1 rounded-lg border bg-muted/15 px-4 py-3">
            <p className="text-sm font-medium">{member?.fullName}</p>
            <p className="text-sm text-muted-foreground">{member?.email}</p>
            {member ? (
              <p className="text-xs text-muted-foreground">
                Tham gia lúc <DateTimeValue iso={member.joinedAt} />
              </p>
            ) : null}
          </div>
        )}
      </Section>

      <Section
        title="Vai trò"
        description="Chọn một hoặc nhiều vai trò áp dụng cho thành viên này."
        icon={<ShieldCheck aria-hidden />}
      >
        <RoleMultiSelect roles={roles} value={roleIds} onChange={onRoleIdsChange} error={roleIdsError} />
        {canCreateRole ? <InlineRoleCreator onCreated={onRoleCreated} /> : null}
      </Section>

      <Section
        title="Quyền hiệu lực"
        description="Quyền tổng hợp từ mọi vai trò đã chọn ở trên."
        icon={<Eye aria-hidden />}
      >
        <PermissionPreview roles={roles} selectedRoleIds={roleIds} permissionsAvailable={canCreateRole} />
      </Section>
    </FormSurface>
  );
}
