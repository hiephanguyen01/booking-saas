import { data as routeData, redirect } from 'react-router';
import {
  updateCancellationPolicyInputSchema,
  type CancellationPolicyResponse,
} from '@booking/contracts';
import type { Route } from './+types/edit';
import { apiGet, apiPatch } from '~/lib/api.server';
import { requirePartner } from '~/features/partner/server/partner.server';
import { FormPage } from '~/components/form-page';
import { CancellationPolicyForm } from '~/features/cancellation-policies/components/cancellation-policy-form';
import { dashboardPaths } from '~/constants/paths';
import { apiPaths } from '~/constants/api-paths';
import { actionMessages } from '~/constants/messages';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Sửa chính sách huỷ · Đối tác · BookingOS' }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { auth } = await requirePartner(request, 'partner.listings.write');
  const res = await apiGet<CancellationPolicyResponse>(
    apiPaths.partner.cancellationPolicy(params.policyId),
    auth,
  );
  if (!res.ok || !res.data) {
    throw new Response('Không tìm thấy chính sách huỷ.', {
      status: res.status === 403 ? 403 : 404,
    });
  }
  // A tenant-level (shared) policy is read-only to a partner — don't open the editor.
  if (res.data.partnerId === null) {
    throw new Response('Không thể sửa chính sách chung của tổ chức.', { status: 403 });
  }
  return { policy: res.data };
}

export async function action({ request, params }: Route.ActionArgs) {
  const { auth } = await requirePartner(request, 'partner.listings.write');
  const parsed = updateCancellationPolicyInputSchema.safeParse(await request.json());
  if (!parsed.success) {
    return routeData(
      { error: null, fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  const res = await apiPatch(
    apiPaths.partner.cancellationPolicy(params.policyId),
    parsed.data,
    auth,
  );
  if (!res.ok) {
    return routeData(
      { error: res.error ?? actionMessages.saveFailed, fieldErrors: res.errors ?? null },
      { status: 400 },
    );
  }
  return redirect(dashboardPaths.partner.cancellationPolicies);
}

export default function EditCancellationPolicy({ loaderData, actionData }: Route.ComponentProps) {
  return (
    <FormPage
      backTo={dashboardPaths.partner.cancellationPolicies}
      backLabel="Chính sách huỷ"
      title="Sửa chính sách huỷ"
      description={loaderData.policy.name}
    >
      <CancellationPolicyForm
        policy={loaderData.policy}
        serverError={actionData?.error ?? null}
        fieldErrors={actionData?.fieldErrors ?? null}
      />
    </FormPage>
  );
}
