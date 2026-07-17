import { createCancellationPolicyInputSchema } from '@booking/contracts';
import { redirect, data as routeData } from 'react-router';
import { BackLink } from '~/components/back-link';
import { PageHeader } from '~/components/page-header';
import { apiPost } from '~/lib/api.server';
import { CancellationPolicyForm } from '~/features/partner/components/cancellation-policy-form';
import { requirePartner } from '~/features/partner/server/partner.server';
import { dashboardPaths } from '~/constants/paths';
import type { Route } from './+types/new';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Chính sách huỷ mới · Đối tác · Bookify' }];
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
  const res = await apiPost('/partner/cancellation-policies', parsed.data, auth);
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
    <div className="space-y-5">
      <div>
        <BackLink
          to={dashboardPaths.partner.cancellationPolicies}
          label="Chính sách huỷ"
          className="mb-2"
        />
        <PageHeader
          title="Chính sách huỷ mới"
          description="Đặt tên và các mốc hoàn tiền cho chính sách."
        />
      </div>
      <CancellationPolicyForm
        serverError={actionData?.error ?? null}
        fieldErrors={actionData?.fieldErrors ?? null}
      />
    </div>
  );
}
