import { data as routeData, redirect } from 'react-router';
import {
  createHousePartnerInputSchema,
  type CreateHousePartnerInput,
  type PartnerResponse,
} from '@booking/contracts';
import { GenericForm } from '@booking/ui/components/form/generic-form';
import type { FieldConfig } from '@booking/ui/components/form/types';
import { Store } from 'lucide-react';
import type { Route } from './+types/new';
import { apiPost } from '~/lib/api.server';
import { requireTenant } from '~/features/tenant/server/tenant.server';
import { FormPage } from '~/components/form-page';
import { fieldNode, FORM_ACTIONS_ROW, FormSurface, Section } from '~/components/form-layout';
import { dashboardPaths } from '~/constants/paths';
import { apiPaths } from '~/constants/api-paths';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Đối tác nội bộ mới · Tenant · BookingOS' }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireTenant(request, 'tenant.partners.manage');
  return null;
}

export async function action({ request }: Route.ActionArgs) {
  const { auth } = await requireTenant(request, 'tenant.partners.manage');
  const parsed = createHousePartnerInputSchema.safeParse(await request.json());
  if (!parsed.success) {
    return routeData({ error: null, fieldErrors: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const res = await apiPost<PartnerResponse>(apiPaths.tenant.housePartners, parsed.data, auth);
  if (!res.ok || !res.data) {
    return routeData(
      { error: res.error ?? 'Không tạo được đối tác.', fieldErrors: res.errors ?? null },
      { status: 400 },
    );
  }
  return redirect(dashboardPaths.tenant.partner(res.data.id));
}

const fields: FieldConfig<CreateHousePartnerInput>[] = [
  { name: 'name', type: 'text', label: 'Tên đối tác', placeholder: 'Kho thiết bị nội bộ', colSpan: 2 },
  {
    name: 'slug',
    type: 'text',
    label: 'Slug',
    placeholder: 'kho-noi-bo',
    description: 'Chữ thường, số và dấu gạch ngang.',
    colSpan: 2,
  },
  {
    name: 'description',
    type: 'textarea',
    label: 'Giới thiệu (tuỳ chọn)',
    placeholder: 'Inventory do chính tenant vận hành.',
    colSpan: 2,
  },
];

export default function NewHousePartner({ actionData }: Route.ComponentProps) {
  return (
    <FormPage
      backTo={dashboardPaths.tenant.partners}
      backLabel="Đối tác"
      title="Đối tác nội bộ mới"
      description="Tạo đối tác nội bộ (house) để tenant tự bán inventory của mình — được duyệt sẵn, không cần xác minh danh tính."
    >
      <GenericForm
        schema={createHousePartnerInputSchema}
        fields={fields}
        columns={2}
        submitLabel="Tạo đối tác"
        defaultValues={{ name: '', slug: '', description: '' }}
        serverError={actionData?.error ?? null}
        fieldErrors={actionData?.fieldErrors ?? null}
        actionsClassName={FORM_ACTIONS_ROW}
        warnOnUnsavedChanges
        renderFields={(renderedFields) => (
          <FormSurface>
            <Section
              title="Thông tin đối tác"
              description="Đối tác nội bộ được duyệt sẵn và thuộc quyền vận hành của tenant."
              icon={<Store aria-hidden />}
            >
              {fieldNode(renderedFields, 'name')}
              {fieldNode(renderedFields, 'slug')}
              {fieldNode(renderedFields, 'description')}
            </Section>
          </FormSurface>
        )}
      />
    </FormPage>
  );
}
