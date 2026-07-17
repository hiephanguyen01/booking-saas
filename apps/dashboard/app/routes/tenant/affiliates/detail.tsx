import { data as routeData } from 'react-router';
import type {
  AffiliateDetailResponse,
  AffiliateRateResponse,
  AffiliateStatusResponse,
} from '@booking/contracts';
import type { Route } from './+types/detail';
import { apiGet, apiPatch, apiPost } from '~/lib/api.server';
import { requireTenant } from '~/features/tenant/server/tenant.server';
import { formatDiscount } from '~/lib/format';
import { BackLink } from '~/components/back-link';
import { ErrorBanner, SuccessBanner } from '~/components/action-feedback';
import { PageHeader } from '~/components/page-header';
import { PartnerStatusBadge } from '~/components/status-badge';
import type { AffiliateDetailActionData } from '~/features/tenant/components/affiliates/types';
import { AffiliateCommissionsTable } from '~/features/tenant/components/affiliates/affiliate-commissions-table';
import { AffiliateEarningsCards } from '~/features/tenant/components/affiliates/affiliate-earnings-cards';
import { AffiliateLinksTable } from '~/features/tenant/components/affiliates/affiliate-links-table';
import { AffiliateProfilePanel } from '~/features/tenant/components/affiliates/affiliate-profile-panel';
import { AffiliateStatusActions } from '~/features/tenant/components/affiliates/affiliate-status-actions';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Cộng tác viên · Chi tiết · Bookify' }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { auth } = await requireTenant(request, 'tenant.affiliates.manage');
  const res = await apiGet<AffiliateDetailResponse>(
    `/tenant/affiliates/${params.affiliateId}`,
    auth,
  );
  if (!res.ok || !res.data) {
    throw new Response('Không tìm thấy cộng tác viên', { status: 404 });
  }
  return { detail: res.data };
}

export async function action({ request, params }: Route.ActionArgs) {
  const { auth } = await requireTenant(request, 'tenant.affiliates.manage');
  const form = await request.formData();
  const intent = String(form.get('intent'));
  const id = params.affiliateId;

  if (intent === 'status') {
    const status = String(form.get('status'));
    if (status !== 'approved' && status !== 'suspended') {
      return routeData(
        { ok: false, error: 'Trạng thái không hợp lệ.', message: null } satisfies AffiliateDetailActionData,
        { status: 400 },
      );
    }
    const res = await apiPost<AffiliateStatusResponse>(
      `/tenant/affiliates/${id}/status`,
      { status },
      auth,
    );
    if (!res.ok) {
      return routeData(
        { ok: false, error: res.error ?? 'Không cập nhật được.', message: null } satisfies AffiliateDetailActionData,
        { status: 400 },
      );
    }
    const applied = res.data?.status ?? status;
    return {
      ok: true,
      error: null,
      message: applied === 'approved' ? 'Đã duyệt cộng tác viên.' : 'Đã tạm ngưng cộng tác viên.',
    } satisfies AffiliateDetailActionData;
  }

  if (intent === 'rate') {
    const raw = String(form.get('customRate') ?? '').trim();
    const customRate = raw === '' ? null : raw;
    if (customRate !== null && !/^\d+$/.test(customRate)) {
      return routeData(
        { ok: false, error: 'Hoa hồng phải là số nguyên phần trăm.', message: null } satisfies AffiliateDetailActionData,
        { status: 400 },
      );
    }
    const res = await apiPatch<AffiliateRateResponse>(
      `/tenant/affiliates/${id}`,
      { customRate },
      auth,
    );
    if (!res.ok) {
      // The backend guard (platform% + affiliate% ≤ tenant%) returns a clear message.
      return routeData(
        { ok: false, error: res.error ?? 'Không lưu được hoa hồng.', message: null } satisfies AffiliateDetailActionData,
        { status: 400 },
      );
    }
    // Render the resolved rate the backend echoes back — clearing the override
    // falls back to the rule, whose number the caller could not otherwise know.
    const resolved = res.data;
    const rate = resolved ? formatDiscount(resolved.effectiveRateType, resolved.effectiveRate) : '';
    const message =
      resolved && resolved.customRate === null
        ? `Đã xoá hoa hồng riêng — áp dụng mức theo quy tắc: ${rate}.`
        : `Đã lưu hoa hồng riêng: ${rate}.`;
    return { ok: true, error: null, message } satisfies AffiliateDetailActionData;
  }

  return routeData(
    { ok: false, error: 'Thao tác không hợp lệ.', message: null } satisfies AffiliateDetailActionData,
    { status: 400 },
  );
}

export default function AffiliateDetail({ loaderData, actionData }: Route.ComponentProps) {
  const { detail } = loaderData;
  const { affiliate, links, commissions } = detail;

  return (
    <div className="space-y-6">
      <BackLink to="/tenant/affiliates" label="Cộng tác viên" />

      <PageHeader
        title={affiliate.userName}
        description={affiliate.userEmail}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <PartnerStatusBadge status={affiliate.status} />
            <AffiliateStatusActions affiliate={affiliate} />
          </div>
        }
      />

      <ErrorBanner error={actionData?.error} />
      <SuccessBanner message={actionData?.ok ? actionData.message : null} />

      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        <AffiliateProfilePanel affiliate={affiliate} />

        <div className="space-y-6">
          <AffiliateEarningsCards affiliate={affiliate} />
          <AffiliateLinksTable links={links} />
          <AffiliateCommissionsTable commissions={commissions} />
        </div>
      </div>
    </div>
  );
}
