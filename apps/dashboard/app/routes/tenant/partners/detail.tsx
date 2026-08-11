import { data as routeData } from 'react-router';
import {
  createCommissionRuleInputSchema,
  updateCommissionRuleInputSchema,
  updatePartnerTaxStatusInputSchema,
  type CommissionRuleResponse,
  type PartnerResponse,
} from '@booking/contracts';
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
import { apiDelete, apiGet, apiPatch, apiPost } from '~/lib/api.server';
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
import { PartnerTaxStatusCard } from '~/features/tenant/components/partners/partner-tax-status-card';
import { PartnerCommissionCard } from '~/features/tenant/components/partners/partner-commission-card';
import {
  readCommissionRatePatch,
  readCreateCommissionRule,
} from '~/features/tenant/server/commission-rule-form.server';
import { useTenantArea } from '~/features/tenant/lib/area-context';
import { apiPaths } from '~/constants/api-paths';
import { dashboardPaths } from '~/constants/paths';
import { actionMessages } from '~/constants/messages';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Chi tiết đối tác · Tenant · BookingOS' }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { auth, can } = await requireTenant(request, 'tenant.partners.read');
  const canCommissions = can('tenant.commissions.manage');
  const [res, rulesRes] = await Promise.all([
    apiGet<PartnerResponse>(apiPaths.tenant.partner(params.partnerId), auth),
    canCommissions
      ? apiGet<CommissionRuleResponse[]>(apiPaths.tenant.commissionRules, auth)
      : Promise.resolve(null),
  ]);
  if (!res.ok || !res.data) throw new Response('Không tìm thấy đối tác', { status: 404 });
  const rules = rulesRes?.ok ? (rulesRes.data ?? []) : [];
  return {
    partner: res.data,
    canApprove: can('tenant.partners.approve'),
    canManage: can('tenant.partners.manage'),
    canCommissions,
    defaultCommission: rules.find((rule) => rule.appliesTo === 'tenant_default') ?? null,
    partnerCommission:
      rules.find((rule) => rule.appliesTo === 'partner' && rule.partnerId === params.partnerId) ??
      null,
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

  if (
    intent === 'create-partner-commission' ||
    intent === 'update-partner-commission' ||
    intent === 'delete-partner-commission'
  ) {
    if (!can('tenant.commissions.manage')) {
      return routeData({ error: 'Bạn không có quyền quản lý hoa hồng.' }, { status: 403 });
    }

    const rulesRes = await apiGet<CommissionRuleResponse[]>(
      apiPaths.tenant.commissionRules,
      auth,
    );
    if (!rulesRes.ok) {
      return routeData(
        { error: rulesRes.error ?? 'Không kiểm tra được quy tắc hoa hồng.' },
        { status: 400 },
      );
    }
    const partnerRule =
      rulesRes.data?.find(
        (rule) => rule.appliesTo === 'partner' && rule.partnerId === params.partnerId,
      ) ?? null;

    if (intent === 'delete-partner-commission') {
      const ruleId = String(form.get('ruleId') ?? '');
      if (!partnerRule || partnerRule.id !== ruleId) {
        return routeData({ error: 'Quy tắc không thuộc đối tác này.' }, { status: 400 });
      }
      const res = await apiDelete(apiPaths.tenant.commissionRule(ruleId), auth);
      if (!res.ok)
        return routeData(
          { error: res.error ?? 'Không xoá được mức hoa hồng riêng.' },
          { status: 400 },
        );
      return { ok: true, intent, verificationStatus: null };
    }

    if (intent === 'create-partner-commission') {
      const parsed = createCommissionRuleInputSchema.safeParse(readCreateCommissionRule(form));
      if (!parsed.success || parsed.data.partnerId !== params.partnerId) {
        return routeData({ error: 'Tỷ lệ hoa hồng không hợp lệ.' }, { status: 400 });
      }
      if (partnerRule) {
        return routeData(
          { error: 'Đối tác đã có mức riêng. Tải lại trang để cập nhật.' },
          { status: 409 },
        );
      }
      const res = await apiPost(apiPaths.tenant.commissionRules, parsed.data, auth);
      if (!res.ok)
        return routeData(
          { error: res.error ?? 'Không tạo được mức hoa hồng riêng.' },
          { status: 400 },
        );
      return { ok: true, intent, verificationStatus: null };
    }

    const ruleId = String(form.get('ruleId') ?? '');
    if (!partnerRule || partnerRule.id !== ruleId) {
      return routeData({ error: 'Quy tắc không thuộc đối tác này.' }, { status: 400 });
    }
    const parsed = updateCommissionRuleInputSchema.safeParse(readCommissionRatePatch(form));
    if (!parsed.success) {
      return routeData({ error: 'Tỷ lệ hoa hồng không hợp lệ.' }, { status: 400 });
    }
    const res = await apiPatch(apiPaths.tenant.commissionRule(ruleId), parsed.data, auth);
    if (!res.ok)
      return routeData(
        { error: res.error ?? 'Không cập nhật được mức hoa hồng.' },
        { status: 400 },
      );
    return { ok: true, intent, verificationStatus: null };
  }

  // Its own branch rather than the generic `/partners/:id/:intent` path below:
  // this one carries a body and its endpoint name differs from the intent.
  if (intent === 'set-tax-status') {
    if (!can('tenant.partners.manage')) {
      return routeData({ error: 'Bạn không có quyền quản lý đối tác.' }, { status: 403 });
    }
    const parsed = updatePartnerTaxStatusInputSchema.safeParse({
      taxStatus: String(form.get('taxStatus') ?? ''),
    });
    if (!parsed.success) {
      return routeData({ error: 'Diện thuế không hợp lệ.' }, { status: 400 });
    }
    const res = await apiPost<PartnerResponse>(
      apiPaths.tenant.partnerTaxStatus(params.partnerId),
      parsed.data,
      auth,
    );
    if (!res.ok) {
      return routeData(
        { error: res.error ?? 'Không cập nhật được hồ sơ thuế.' },
        { status: 400 },
      );
    }
    return { ok: true, intent, verificationStatus: null };
  }

  const perm = PERM[intent];
  if (!perm) return routeData({ error: actionMessages.invalidIntent }, { status: 400 });
  if (!can(perm))
    return routeData({ error: 'Bạn không có quyền thực hiện thao tác này.' }, { status: 403 });

  const id = params.partnerId;
  const body =
    intent === 'verify' ? { note: String(form.get('note') ?? '').trim() || undefined } : {};
  const res = await apiPost<PartnerResponse>(`/tenant/partners/${id}/${intent}`, body, auth);
  if (!res.ok)
    return routeData({ error: res.error ?? actionMessages.actionFailed }, { status: 400 });
  // Surface the outcome instead of discarding it — the new verification/status
  // state drives an explicit success banner (loader revalidation refreshes the body).
  return {
    ok: true,
    intent,
    verificationStatus: res.data?.verificationStatus ?? null,
  };
}

export default function PartnerDetail({ loaderData, actionData }: Route.ComponentProps) {
  const { partner, canApprove, canManage, canCommissions, defaultCommission, partnerCommission } =
    loaderData;
  const { readOnly } = useTenantArea();
  const error = actionData && 'error' in actionData ? actionData.error : null;
  const success = actionData && 'ok' in actionData ? actionData : null;

  const contact = partner.contactInfo;
  const business = readBusinessInfo(partner.businessInfo);
  const locality = [contact.wardName, contact.provinceName].filter(Boolean).join(', ');

  return (
    <div className="space-y-6">
      <BackLink to={dashboardPaths.tenant.partners} label="Đối tác" />

      <PageHeader
        title={partner.name}
        description="Hồ sơ đối tác, thông tin định danh và thanh toán."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {partner.isHouse ? <Badge variant="outline">Nội bộ</Badge> : null}
            <Badge variant="secondary">
              {TYPE_LABEL[partner.partnerType] ?? partner.partnerType}
            </Badge>
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
      <PartnerTaxStatusCard
        taxStatus={partner.taxStatus}
        busy={readOnly}
        error={error}
      />

      <PartnerPayoutCard payoutInfo={partner.payoutInfo} />
      {canCommissions && !partner.isHouse ? (
        <PartnerCommissionCard
          partner={partner}
          defaultRule={defaultCommission}
          partnerRule={partnerCommission}
          readOnly={readOnly}
        />
      ) : null}
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
  if (result.intent === 'create-partner-commission')
    return 'Đã tạo mức hoa hồng riêng cho đối tác.';
  if (result.intent === 'update-partner-commission') return 'Đã cập nhật mức hoa hồng của đối tác.';
  if (result.intent === 'delete-partner-commission')
    return 'Đối tác đã quay lại dùng mức mặc định.';
  return 'Thao tác thành công.';
}
