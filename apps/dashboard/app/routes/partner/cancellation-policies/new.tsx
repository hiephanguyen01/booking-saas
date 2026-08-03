import { createCancellationPolicyInputSchema } from '@booking/contracts';
import { redirect, data as routeData } from 'react-router';
import { FormPage } from '~/components/form-page';
import { apiPost } from '~/lib/api.server';
import { CancellationPolicyForm } from '~/features/cancellation-policies/components/cancellation-policy-form';
import { requirePartner } from '~/features/partner/server/partner.server';
import { dashboardPaths } from '~/constants/paths';
import type { Route } from './+types/new';
import { apiPaths } from '~/constants/api-paths';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Chính sách huỷ mới · Đối tác · BookingOS' }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requirePartner(request, 'partner.listings.write');
  return null;
}

export async function action({ request }: Route.ActionArgs) {
  const { auth } = await requirePartner(request, 'partner.listings.write');
  const parsed = createCancellationPolicyInputSchema.safeParse(await request.json());
  if (!parsed.success) {
    return routeData(
      { error: null, fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  const res = await apiPost(apiPaths.partner.cancellationPolicies, parsed.data, auth);
  if (!res.ok) {
    return routeData(
      { error: res.error ?? 'Tạo không thành công.', fieldErrors: res.errors ?? null },
      { status: 400 },
    );
  }
  return redirect(dashboardPaths.partner.cancellationPolicies);
}

export default function NewCancellationPolicy({ actionData }: Route.ComponentProps) {
  return (
    <FormPage
      backTo={dashboardPaths.partner.cancellationPolicies}
      backLabel="Chính sách huỷ"
      title="Chính sách huỷ mới"
      description="Đặt tên và các mốc hoàn tiền cho chính sách."
    >
      <CancellationPolicyForm
        serverError={actionData?.error ?? null}
        fieldErrors={actionData?.fieldErrors ?? null}
      />
    </FormPage>
  );
}
