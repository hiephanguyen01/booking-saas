import { data, redirect } from 'react-router';
import {
  createTenantInputSchema,
  createdTenantResponseSchema,
  type CreatedTenantResponse,
} from '@booking/contracts';
import { Card, CardContent, CardHeader, CardTitle } from '@booking/ui/components/ui/card';
import { GenericForm } from '@booking/ui/components/form/generic-form';
import type { Route } from './+types/new';
import { apiPost } from '~/lib/api.server';
import { requirePlatform } from '~/features/admin/server/admin.server';
import { tenantCreateFields } from '~/features/admin/tenant-form-fields';
import { BackLink } from '~/components/back-link';
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Thông tin tenant</CardTitle>
        </CardHeader>
        <CardContent>
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
          />
        </CardContent>
      </Card>
    </div>
  );
}
