import { data as routeData } from 'react-router';
import { CheckCircle2 } from 'lucide-react';
import { updatePartnerDocumentsInputSchema, type UpdatePartnerDocumentsInput } from '@booking/shared';
import { GenericForm } from '@booking/ui/components/form/generic-form';
import type { FieldConfig } from '@booking/ui/components/form/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@booking/ui/components/ui/card';
import { Alert, AlertDescription } from '@booking/ui/components/ui/alert';
import type { Route } from './+types/profile';
import { apiPatch } from '~/lib/api.server';
import { requirePartner, canPartner } from './lib.server';
import { PageHeader } from './components/page-header';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Hồ sơ đối tác · Đối tác · Bookify' }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { membership } = await requirePartner(request);
  return { canManage: canPartner(membership, 'partner.profile.manage') };
}

export async function action({ request }: Route.ActionArgs) {
  const { auth } = await requirePartner(request);
  const parsed = updatePartnerDocumentsInputSchema.safeParse(await request.json());
  if (!parsed.success) {
    return routeData(
      { fieldErrors: parsed.error.flatten().fieldErrors, error: null, ok: false },
      { status: 400 },
    );
  }
  // Only send values that were actually set, so an empty submit never clears
  // documents saved earlier (the backend merges onto existing businessInfo).
  const payload: UpdatePartnerDocumentsInput = {};
  if (parsed.data.logoUrl) payload.logoUrl = parsed.data.logoUrl;
  if (parsed.data.licenseDocs && parsed.data.licenseDocs.length > 0) {
    payload.licenseDocs = parsed.data.licenseDocs;
  }

  const res = await apiPatch('/partner/profile/documents', payload, auth);
  if (!res.ok) {
    return routeData(
      { fieldErrors: null, error: res.error ?? 'Không lưu được hồ sơ.', ok: false },
      { status: 400 },
    );
  }
  return { fieldErrors: null, error: null, ok: true as const };
}

const fields: FieldConfig<UpdatePartnerDocumentsInput>[] = [
  {
    name: 'logoUrl',
    type: 'file',
    target: 'partners',
    label: 'Logo đối tác',
    description: 'Hình đại diện hiển thị với khách sau khi đặt.',
  },
  {
    name: 'licenseDocs',
    type: 'file',
    target: 'partners',
    multiple: true,
    maxFiles: 10,
    label: 'Giấy phép / hồ sơ pháp lý',
    description: 'Tải lên ảnh giấy phép kinh doanh hoặc hồ sơ định danh.',
  },
];

const DEFAULTS: UpdatePartnerDocumentsInput = { logoUrl: '', licenseDocs: [] };

export default function PartnerProfile({ loaderData, actionData }: Route.ComponentProps) {
  const { canManage } = loaderData;
  const ok = Boolean(actionData && 'ok' in actionData && actionData.ok);
  const error = actionData && 'error' in actionData ? actionData.error : null;
  const fieldErrors = actionData && 'fieldErrors' in actionData ? actionData.fieldErrors : null;

  return (
    <div className="space-y-6">
      <PageHeader title="Hồ sơ đối tác" description="Tải lên logo và giấy tờ pháp lý cho hồ sơ của bạn." />

      {!canManage ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Bạn không có quyền chỉnh sửa hồ sơ đối tác.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Logo & giấy tờ</CardTitle>
            <CardDescription>
              Hình ảnh được tải trực tiếp lên kho lưu trữ; chỉ đường dẫn được lưu vào hồ sơ.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {ok ? (
              <Alert className="mb-4 border-emerald-500/40 text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="size-4" />
                <AlertDescription>Đã lưu hồ sơ.</AlertDescription>
              </Alert>
            ) : null}
            <GenericForm
              schema={updatePartnerDocumentsInputSchema}
              fields={fields}
              defaultValues={DEFAULTS}
              submitLabel="Lưu hồ sơ"
              method="patch"
              serverError={error}
              fieldErrors={fieldErrors}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
