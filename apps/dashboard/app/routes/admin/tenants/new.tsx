import { data, redirect } from 'react-router';
import {
  createTenantInputSchema,
  createdTenantResponseSchema,
  type CreatedTenantResponse,
} from '@booking/contracts';
import { GenericForm } from '@booking/ui/components/form/generic-form';
import { Building2, Settings2 } from 'lucide-react';
import type { Route } from './+types/new';
import { apiPost } from '~/lib/api.server';
import { requirePlatform } from '~/features/admin/server/admin.server';
import { tenantCreateFields } from '~/features/admin/tenant-form-fields';
import { FormPage } from '~/components/form-page';
import { fieldNode, FORM_ACTIONS_ROW, FormSurface, Grid, Section } from '~/components/form-layout';
import { dashboardPaths } from '~/constants/paths';
import { apiPaths } from '~/constants/api-paths';
import { TZ } from '~/constants/time';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Tạo tenant · BookingOS Admin' }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requirePlatform(request, 'platform.tenants.write');
  return null;
}

export async function action({ request }: Route.ActionArgs) {
  const { auth } = await requirePlatform(request, 'platform.tenants.write');
  const parsed = createTenantInputSchema.safeParse(await request.json());
  if (!parsed.success) {
    return data({ fieldErrors: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const res = await apiPost<CreatedTenantResponse>(apiPaths.admin.tenants, parsed.data, auth, {
    schema: createdTenantResponseSchema,
  });
  if (!res.ok || !res.data) {
    return data(
      { error: res.error ?? 'Không tạo được tenant.', fieldErrors: res.errors },
      { status: 400 },
    );
  }
  return redirect(dashboardPaths.admin.tenant(res.data.id));
}

export default function NewTenant({ actionData }: Route.ComponentProps) {
  const serverError = actionData && 'error' in actionData ? actionData.error : null;
  const fieldErrors = actionData && 'fieldErrors' in actionData ? actionData.fieldErrors : null;

  return (
    <FormPage
      backTo={dashboardPaths.admin.tenants}
      backLabel="Danh sách tenant"
      title="Tạo tenant"
      description="Khởi tạo một tenant mới cùng tên miền phụ mặc định."
    >
      <GenericForm
        schema={createTenantInputSchema}
        fields={tenantCreateFields}
        columns={2}
        submitLabel="Tạo tenant"
        defaultValues={{
          name: '',
          slug: '',
          vertical: 'studio',
          defaultTimezone: TZ,
          defaultLocale: 'vi',
        }}
        serverError={serverError}
        fieldErrors={fieldErrors}
        actionsClassName={FORM_ACTIONS_ROW}
        warnOnUnsavedChanges
        renderFields={(renderedFields) => (
          <FormSurface>
            <Section
              title="Nhận diện tenant"
              description="Tên hiển thị, đường dẫn hệ thống và loại hình kinh doanh."
              icon={<Building2 aria-hidden />}
            >
              {fieldNode(renderedFields, 'name')}
              <Grid>
                {fieldNode(renderedFields, 'slug')}
                {fieldNode(renderedFields, 'vertical')}
              </Grid>
            </Section>
            <Section
              title="Thiết lập mặc định"
              description="Áp dụng cho dữ liệu mới và giao diện của tenant."
              icon={<Settings2 aria-hidden />}
            >
              <Grid>
                {fieldNode(renderedFields, 'defaultTimezone')}
                {fieldNode(renderedFields, 'defaultLocale')}
              </Grid>
            </Section>
          </FormSurface>
        )}
      />
    </FormPage>
  );
}
