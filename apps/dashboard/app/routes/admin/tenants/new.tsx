import { data, Link, redirect } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { createTenantInputSchema, type CreateTenantInput, type TenantResponse } from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@booking/ui/components/ui/card';
import { GenericForm } from '@booking/ui/components/form/generic-form';
import type { FieldConfig } from '@booking/ui/components/form/types';
import type { Route } from './+types/new';
import { apiPost } from '~/lib/api.server';
import { requirePlatform } from '~/features/admin/server/admin.server';
import { PageHeader } from '~/components/page-header';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Tạo tenant · Bookify Admin' }];
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

  const res = await apiPost<TenantResponse>('/admin/tenants', parsed.data, auth);
  if (!res.ok || !res.data) {
    return data(
      { error: res.error ?? 'Không tạo được tenant.', fieldErrors: res.errors },
      { status: 400 },
    );
  }
  return redirect(`/admin/tenants/${res.data.id}`);
}

const fields: FieldConfig<CreateTenantInput>[] = [
  { name: 'name', type: 'text', label: 'Tên tenant', placeholder: 'Studio Ánh Dương', colSpan: 2 },
  {
    name: 'slug',
    type: 'text',
    label: 'Slug',
    placeholder: 'studio-anh-duong',
    description: 'Chữ thường, số và dấu gạch ngang. Dùng cho tên miền phụ mặc định.',
  },
  {
    name: 'vertical',
    type: 'select',
    label: 'Loại hình',
    options: [
      { label: 'Studio', value: 'studio' },
      { label: 'Cho thuê', value: 'rental' },
      { label: 'Lớp học', value: 'classes' },
    ],
  },
  {
    name: 'defaultTimezone',
    type: 'text',
    label: 'Múi giờ mặc định',
    placeholder: 'Asia/Ho_Chi_Minh',
  },
  {
    name: 'defaultLocale',
    type: 'select',
    label: 'Ngôn ngữ mặc định',
    options: [
      { label: 'Tiếng Việt', value: 'vi' },
      { label: 'English', value: 'en' },
    ],
  },
];

export default function NewTenant({ actionData }: Route.ComponentProps) {
  const serverError = actionData && 'error' in actionData ? actionData.error : null;
  const fieldErrors = actionData && 'fieldErrors' in actionData ? actionData.fieldErrors : null;

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
          <Link to="/admin/tenants">
            <ArrowLeft className="size-4" />
            Danh sách tenant
          </Link>
        </Button>
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
            fields={fields}
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
