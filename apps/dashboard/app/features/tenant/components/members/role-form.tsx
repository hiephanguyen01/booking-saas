import type { ReactNode } from 'react';
import { Link } from 'react-router';
import {
  createTenantRoleInputSchema,
  updateTenantRoleInputSchema,
  type CreateTenantRoleInput,
  type TenantPermissionKey,
  type TenantRoleDetail,
} from '@booking/contracts';
import { Badge } from '@booking/ui/components/ui/badge';
import { Button } from '@booking/ui/components/ui/button';
import { GenericForm } from '@booking/ui/components/form/generic-form';
import { Controller } from '@booking/ui/components/form/rhf';
import type { FieldConfig } from '@booking/ui/components/form/types';
import { Copy, ShieldCheck, Tag } from 'lucide-react';
import { fieldNode, FORM_ACTIONS_ROW, FormSurface, Section } from '~/components/form-layout';
import { dashboardPaths } from '~/constants/paths';
import { PermissionGrid } from './permission-grid';

const nameField: FieldConfig<CreateTenantRoleInput>[] = [
  {
    name: 'name',
    type: 'text',
    label: 'Tên vai trò',
    placeholder: 'Ví dụ: Lễ tân',
    colSpan: 2,
  },
];

type RoleFormProps =
  | {
      mode: 'create';
      /** Pre-filled name/permissions when this create is a "Nhân bản" of an existing role. */
      initialName?: string;
      initialPermissions?: TenantPermissionKey[];
      serverError?: string | null;
      fieldErrors?: Record<string, string[]> | null;
    }
  | {
      mode: 'edit';
      role: TenantRoleDetail;
      serverError?: string | null;
      fieldErrors?: Record<string, string[]> | null;
    }
  | {
      /** A system role, opened read-only — see the module doc comment below. */
      mode: 'view';
      role: TenantRoleDetail;
    };

/**
 * Create, edit and read-only-view of one tenant role share this component —
 * `mode` switches the schema/defaults/section body, never a second copy of
 * the layout (apps/dashboard/CLAUDE.md "Full-page forms").
 *
 * A system role (`isSystem`) never reaches `mode="edit"`: it is shared across
 * every tenant on the platform and the backend refuses to write to it
 * (`SYSTEM_ROLE_IMMUTABLE`) — a form that lets an operator type changes it
 * will then reject is worse than one that never offers the field. The caller
 * (`routes/tenant/roles/edit.tsx`) picks `mode="view"` for those instead: the
 * same two sections, permissions rendered through `PermissionGrid`'s
 * `readOnly`, with a "Nhân bản" action in place of a submit button — it
 * navigates to the create screen (`roleNewFrom`) with this role's permissions
 * preselected under a distinct, editable name, never mutating the source role.
 */
export function RoleForm(props: RoleFormProps) {
  if (props.mode === 'view') {
    const { role } = props;
    return (
      <>
        <FormSurface>
          <Section
            title="Tên vai trò"
            description="Vai trò hệ thống dùng chung cho mọi tenant trên nền tảng — không thể đổi tên hay xoá."
            icon={<Tag aria-hidden />}
          >
            <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/15 px-4 py-3">
              <p className="text-sm font-medium">{role.name}</p>
              <Badge variant="outline" className="font-normal">
                Hệ thống
              </Badge>
              <span className="text-xs text-muted-foreground">
                · {role.memberCount} người đang giữ vai trò này
              </span>
            </div>
          </Section>
          <Section
            title="Quyền"
            description={`${role.permissions.length} quyền — chỉ xem, không thể chỉnh sửa.`}
            icon={<ShieldCheck aria-hidden />}
          >
            <PermissionGrid value={role.permissions} onChange={() => {}} readOnly />
          </Section>
        </FormSurface>
        <div className={`flex items-center gap-3 ${FORM_ACTIONS_ROW}`}>
          <Button asChild>
            <Link to={dashboardPaths.tenant.roleNewFrom(role.id)}>
              <Copy className="size-4" /> Nhân bản
            </Link>
          </Button>
        </div>
      </>
    );
  }

  if (props.mode === 'edit') {
    const { role, serverError, fieldErrors } = props;
    return (
      <GenericForm
        schema={updateTenantRoleInputSchema}
        fields={nameField}
        defaultValues={{ name: role.name, permissions: role.permissions }}
        submitLabel="Lưu thay đổi"
        submitPendingLabel="Đang lưu..."
        serverError={serverError}
        fieldErrors={fieldErrors}
        actionsClassName={FORM_ACTIONS_ROW}
        warnOnUnsavedChanges
        renderFields={(renderedFields, _values, form) => (
          <Controller
            control={form.control}
            name="permissions"
            render={({ field, fieldState }) => (
              <RoleFormSections
                nameNode={fieldNode(renderedFields, 'name')}
                permissions={field.value ?? []}
                onPermissionsChange={field.onChange}
                permissionsError={fieldState.error?.message ? [fieldState.error.message] : undefined}
              />
            )}
          />
        )}
        transform={(data) => ({
          intent: 'update-role',
          roleId: role.id,
          name: data.name,
          permissions: data.permissions,
        })}
      />
    );
  }

  const { initialName, initialPermissions, serverError, fieldErrors } = props;
  return (
    <GenericForm
      schema={createTenantRoleInputSchema}
      fields={nameField}
      defaultValues={{ name: initialName ?? '', permissions: initialPermissions ?? [] }}
      submitLabel="Tạo vai trò"
      submitPendingLabel="Đang tạo..."
      serverError={serverError}
      fieldErrors={fieldErrors}
      actionsClassName={FORM_ACTIONS_ROW}
      warnOnUnsavedChanges
      renderFields={(renderedFields, _values, form) => (
        <Controller
          control={form.control}
          name="permissions"
          render={({ field, fieldState }) => (
            <RoleFormSections
              nameNode={fieldNode(renderedFields, 'name')}
              permissions={field.value ?? []}
              onPermissionsChange={field.onChange}
              permissionsError={fieldState.error?.message ? [fieldState.error.message] : undefined}
            />
          )}
        />
      )}
      transform={(data) => ({
        intent: 'create-role',
        name: data.name,
        permissions: data.permissions,
      })}
    />
  );
}

/** The two section bodies both editable modes render: name, then permissions. */
function RoleFormSections({
  nameNode,
  permissions,
  onPermissionsChange,
  permissionsError,
}: {
  nameNode: ReactNode;
  permissions: TenantPermissionKey[];
  onPermissionsChange: (next: TenantPermissionKey[]) => void;
  permissionsError?: string[];
}) {
  return (
    <FormSurface>
      <Section
        title="Tên vai trò"
        description="Tên hiển thị cho vai trò này trong danh sách nhân sự."
        icon={<Tag aria-hidden />}
      >
        {nameNode}
      </Section>
      <Section
        title="Quyền"
        description="Chọn các quyền vai trò này cấp cho thành viên được gán."
        icon={<ShieldCheck aria-hidden />}
      >
        <PermissionGrid value={permissions} onChange={onPermissionsChange} error={permissionsError} />
      </Section>
    </FormSurface>
  );
}
