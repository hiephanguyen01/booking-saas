import { data, redirect } from 'react-router';
import {
  createTenantInputSchema,
  createdTenantResponseSchema,
  type CreatedTenantResponse,
} from '@booking/contracts';
import { GenericForm } from '@booking/ui/components/form/generic-form';
import type { Route } from './+types/new';
import { apiPost } from '~/lib/api.server';
import { requirePlatform } from '~/features/admin/server/admin.server';
import { tenantCreateFields } from '~/features/admin/tenant-form-fields';
import { BackLink } from '~/components/back-link';
import { fieldNode, FormSurface, Grid, Section } from '~/components/form-layout';
import { PageHeader } from '~/components/page-header';

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

  const res = await apiPost<CreatedTenantResponse>('/admin/tenants', parsed.data, auth, {
    schema: createdTenantResponseSchema,
  });
  if (!res.ok || !res.data) {
    return data(
      { error: res.error ?? 'Không tạo được tenant.', fieldErrors: res.errors },
      { status: 400 },
    );
  }
  return redirect(`/admin/tenants/${res.data.id}`);
}

export default function NewTenant({ actionData }: Route.ComponentProps) {
  const serverError = actionData && 'error' in actionData ? actionData.error : null;
  const fieldErrors = actionData && 'fieldErrors' in actionData ? actionData.fieldErrors : null;

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <BackLink to="/admin/tenants" label="Danh sách tenant" />
        <PageHeader
          title="Tạo tenant"
          description="Khởi tạo một tenant mới cùng tên miền phụ mặc định."
        />
      </div>

      <GenericForm
        schema={createTenantInputSchema}
        fields={tenantCreateFields}
        columns={2}
        submitLabel="Tạo tenant"
        defaultValues={{
          name: '',
          slug: '',
          vertical: 'studio',
          defaultTimezone: 'Asia/Ho_Chi_Minh',
          defaultLocale: 'vi',
        }}
        serverError={serverError}
        fieldErrors={fieldErrors}
        actionsClassName="justify-end border-t pt-4"
        warnOnUnsavedChanges
        renderFields={(renderedFields) => (
          <FormSurface>
            <Section
              title="Nhận diện tenant"
              description="Tên hiển thị, đường dẫn hệ thống và loại hình kinh doanh."
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
            >
              <Grid>
                {fieldNode(renderedFields, 'defaultTimezone')}
                {fieldNode(renderedFields, 'defaultLocale')}
              </Grid>
            </Section>
          </FormSurface>
        )}
      />
    </div>
  );
}
