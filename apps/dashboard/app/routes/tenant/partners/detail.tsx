import { data as routeData } from 'react-router';
import type { PartnerResponse } from '@booking/contracts';
import { Badge } from '@booking/ui/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@booking/ui/components/ui/card';
import { DetailGrid } from '@booking/ui/components/detail/detail-grid';
import { DetailField } from '@booking/ui/components/detail/detail-field';
import type { Route } from './+types/detail';
import { apiGet, apiPost } from '~/lib/api.server';
import { requireTenant } from '~/features/tenant/server/tenant.server';
import { PARTNER_TYPE_LABEL as TYPE_LABEL } from '~/constants/partner';
import { BackLink } from '~/components/back-link';
import { ErrorBanner, SuccessBanner } from '~/components/action-feedback';
import { EmailLink, PhoneLink } from '~/components/contact-link';
import { PageHeader } from '~/components/page-header';
import { CopyableCode } from '~/components/copyable-code';
import { DateTimeValue } from '~/components/date-time-value';
import { PartnerStatusBadge, PartnerVerificationBadge } from '~/components/status-badge';
import { readBusinessInfo } from '~/features/tenant/lib/partner-business-info';
import { PartnerIdentityCard } from '~/features/tenant/components/partners/partner-identity-card';
import { PartnerLegalCard } from '~/features/tenant/components/partners/partner-legal-card';
import { PartnerModerationActions } from '~/features/tenant/components/partners/partner-moderation-actions';
import { PartnerPayoutCard } from '~/features/tenant/components/partners/partner-payout-card';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Chi tiết đối tác · Tenant · Bookify' }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { auth, can } = await requireTenant(request, 'tenant.partners.read');
  const res = await apiGet<PartnerResponse>(`/tenant/partners/${params.partnerId}`, auth);
  if (!res.ok || !res.data) throw new Response('Không tìm thấy đối tác', { status: 404 });
  return {
    partner: res.data,
    canApprove: can('tenant.partners.approve'),
    canManage: can('tenant.partners.manage'),
  };
}

/** Intent → the permission the backend enforces, so we fail closed with a clean 403. */
const PERM: Record<string, string> = {
  approve: 'tenant.partners.approve',
  verify: 'tenant.partners.approve',
  suspend: 'tenant.partners.manage',
};

export async function action({ request, params }: Route.ActionArgs) {
  const { auth, can } = await requireTenant(request);
  const form = await request.formData();
  const intent = String(form.get('intent'));
  const perm = PERM[intent];
  if (!perm) return routeData({ error: 'Hành động không hợp lệ.' }, { status: 400 });
  if (!can(perm))
    return routeData({ error: 'Bạn không có quyền thực hiện thao tác này.' }, { status: 403 });

  const id = params.partnerId;
  const body =
    intent === 'verify' ? { note: String(form.get('note') ?? '').trim() || undefined } : {};
  const res = await apiPost<PartnerResponse>(`/tenant/partners/${id}/${intent}`, body, auth);
  if (!res.ok)
    return routeData({ error: res.error ?? 'Thao tác không thành công.' }, { status: 400 });
  // Surface the outcome instead of discarding it — the new verification/status
  // state drives an explicit success banner (loader revalidation refreshes the body).
  return {
    ok: true,
    intent,
    verificationStatus: res.data?.verificationStatus ?? null,
  };
}

export default function PartnerDetail({ loaderData, actionData }: Route.ComponentProps) {
  const { partner, canApprove, canManage } = loaderData;
  const error = actionData && 'error' in actionData ? actionData.error : null;
  const success = actionData && 'ok' in actionData ? actionData : null;

  const contact = partner.contactInfo;
  const business = readBusinessInfo(partner.businessInfo);
  const locality = [contact.wardName, contact.provinceName].filter(Boolean).join(', ');

  return (
    <div className="space-y-6">
      <BackLink to="/tenant/partners" label="Đối tác" />

      <PageHeader
        title={partner.name}
        description="Hồ sơ đối tác, thông tin định danh và thanh toán."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {partner.isHouse ? <Badge variant="outline">Nội bộ</Badge> : null}
            <Badge variant="secondary">{TYPE_LABEL[partner.partnerType] ?? partner.partnerType}</Badge>
            <PartnerStatusBadge status={partner.status} />
            <PartnerVerificationBadge status={partner.verificationStatus} />
          </div>
        }
      />

      <ErrorBanner error={error} />
      <SuccessBanner message={success ? successMessage(success) : null} />

      {/* Contact snapshot — who to reach and where the partner operates. */}
      <Card>
        <CardHeader>
          <CardTitle>Liên hệ</CardTitle>
          <CardDescription>Thông tin liên hệ đối tác cung cấp khi đăng ký.</CardDescription>
        </CardHeader>
        <CardContent>
          <DetailGrid>
            <DetailField
              label="Đường dẫn"
              value={<CopyableCode value={`/${partner.slug}`} label="đường dẫn đối tác" />}
            />
            <DetailField
              label="Số điện thoại"
              value={contact.phone ? <PhoneLink phone={contact.phone} /> : null}
            />
            <DetailField
              label="Email chủ sở hữu"
              value={partner.owner?.email ? <EmailLink email={partner.owner.email} /> : null}
            />
            <DetailField label="Khu vực" value={locality || null} />
            <DetailField label="Địa chỉ" value={contact.address} span={2} />
          </DetailGrid>
        </CardContent>
      </Card>

      <PartnerIdentityCard partner={partner} business={business} />
      <PartnerPayoutCard payoutInfo={partner.payoutInfo} />
      <PartnerLegalCard partner={partner} business={business} />

      {/* Timestamps. */}
      <Card>
        <CardHeader>
          <CardTitle>Thông tin hệ thống</CardTitle>
        </CardHeader>
        <CardContent>
          <DetailGrid columns={3}>
            <DetailField label="Ngày tham gia" value={<DateTimeValue iso={partner.createdAt} />} />
            <DetailField
              label="Xác minh lúc"
              value={partner.verifiedAt ? <DateTimeValue iso={partner.verifiedAt} /> : null}
            />
            <DetailField
              label="Cập nhật lúc"
              value={<DateTimeValue iso={partner.updatedAt} relative />}
            />
          </DetailGrid>
        </CardContent>
      </Card>

      <PartnerModerationActions partner={partner} canApprove={canApprove} canManage={canManage} />
    </div>
  );
}

/** The success banner copy for a completed action. */
function successMessage(result: { intent: string; verificationStatus: string | null }): string {
  if (result.intent === 'approve') return 'Đã duyệt đối tác.';
  if (result.intent === 'suspend') return 'Đã tạm ngưng đối tác.';
  if (result.intent === 'verify') {
    return result.verificationStatus === 'verified'
      ? 'Đã xác minh danh tính đối tác.'
      : 'Đã ghi nhận kết quả xét duyệt danh tính.';
  }
  return 'Thao tác thành công.';
}
