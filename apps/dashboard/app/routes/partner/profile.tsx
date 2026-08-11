import { CircleAlert } from 'lucide-react';
import type {
  PartnerAgreementResponse,
  PartnerResponse,
  PartnerTaxAssessmentResponse,
} from '@booking/contracts';
import { Image } from '@booking/ui/components/media/image';
import { Alert, AlertDescription, AlertTitle } from '@booking/ui/components/ui/alert';
import { DetailGrid } from '@booking/ui/components/detail/detail-grid';
import { DetailField } from '@booking/ui/components/detail/detail-field';
import type { Route } from './+types/profile';
import { apiGet } from '~/lib/api.server';
import { requirePartner } from '~/features/partner/server/partner.server';
import {
  runPartnerProfileAction,
  type PartnerProfileActionResult,
  type PartnerProfileIntent,
} from '~/features/partner/server/profile-actions.server';
import { ProfileIdentityCard } from '~/features/partner/components/profile/profile-identity-card';
import { ProfilePayoutCard } from '~/features/partner/components/profile/profile-payout-card';
import { ProfileDocumentsCard } from '~/features/partner/components/profile/profile-documents-card';
import { PageHeader } from '~/components/page-header';
import { PartnerStatusBadge, PartnerVerificationBadge } from '~/components/status-badge';
import { DateTimeValue } from '~/components/date-time-value';
import { EnumValue } from '~/components/enum-value';
import { CopyableCode } from '~/components/copyable-code';
import { readString } from '~/lib/records';
import { PARTNER_TYPE_LABEL } from '~/constants/partner';
import { FormSurface, Section } from '~/components/form-layout';
import { apiPaths } from '~/constants/api-paths';
import { PartnerTaxAssessmentCard } from '~/features/tax/components/partner-tax-assessment-card';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Hồ sơ đối tác · Đối tác · BookingOS' }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { auth, can } = await requirePartner(request);
  const canManage = can('partner.profile.manage');
  // GET /partner/profile is guarded by `partner.profile.manage` (it exposes the
  // payout account + ID number). Only fetch when the caller holds it.
  if (!canManage) {
    return {
      canManage: false as const,
      partner: null,
      agreements: [] as PartnerAgreementResponse[],
      taxAssessment: null as PartnerTaxAssessmentResponse | null,
      loadError: null as string | null,
    };
  }
  const res = await apiGet<PartnerResponse>(apiPaths.partner.profile, auth);
  const household =
    res.data?.taxStatus === 'household_below_threshold' ||
    res.data?.taxStatus === 'household_declaring';
  const [agreementRes, taxRes] = await Promise.all([
    apiGet<PartnerAgreementResponse[]>(apiPaths.partner.profileAgreements, auth),
    household
      ? apiGet<PartnerTaxAssessmentResponse>(apiPaths.partner.profileTaxAssessment, auth)
      : Promise.resolve(null),
  ]);
  return {
    canManage: true as const,
    partner: res.ok && res.data ? res.data : null,
    agreements: agreementRes.ok && agreementRes.data ? agreementRes.data : [],
    taxAssessment: taxRes?.ok ? (taxRes.data ?? null) : null,
    loadError: res.ok ? null : (res.error ?? 'Không tải được hồ sơ đối tác.'),
  };
}

export async function action({ request }: Route.ActionArgs) {
  const { auth } = await requirePartner(request);
  return runPartnerProfileAction(request, auth);
}

export default function PartnerProfile({ loaderData, actionData }: Route.ComponentProps) {
  const { canManage, partner, agreements, taxAssessment, loadError } = loaderData;

  const resultFor = (intent: PartnerProfileIntent): PartnerProfileActionResult | null =>
    actionData && actionData.intent === intent ? actionData : null;

  if (!canManage) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Hồ sơ đối tác"
          description="Thông tin, định danh và tài khoản nhận tiền."
        />
        <div className="rounded-xl border bg-background p-6 text-sm text-muted-foreground">
          Bạn không có quyền xem và chỉnh sửa hồ sơ đối tác.
        </div>
      </div>
    );
  }

  if (!partner) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Hồ sơ đối tác"
          description="Thông tin, định danh và tài khoản nhận tiền."
        />
        <Alert variant="destructive">
          <CircleAlert className="size-4" />
          <AlertDescription>{loadError ?? 'Không tải được hồ sơ đối tác.'}</AlertDescription>
        </Alert>
      </div>
    );
  }

  const logoUrl = readString(partner.businessInfo.logoUrl);
  const identity = partner.identityInfo;
  const contact = partner.contactInfo;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Hồ sơ đối tác"
        description="Quản lý thông tin công khai, xác minh và tài khoản nhận tiền."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <PartnerStatusBadge status={partner.status} />
            <PartnerVerificationBadge status={partner.verificationStatus} />
          </div>
        }
      />

      <section className="rounded-xl border bg-background">
        <div className="flex flex-col gap-5 p-6 sm:flex-row sm:items-start">
          {logoUrl ? (
            <Image
              src={logoUrl}
              alt={`Logo ${partner.name}`}
              loading="eager"
              className="size-16 shrink-0 rounded-lg border object-cover"
            />
          ) : (
            <div className="flex size-16 shrink-0 items-center justify-center rounded-lg bg-muted text-xl font-semibold text-muted-foreground">
              {partner.name.slice(0, 1).toLocaleUpperCase('vi')}
            </div>
          )}
          <div className="min-w-0">
            <h2 className="text-xl font-semibold tracking-tight">{partner.name}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              <EnumValue map={PARTNER_TYPE_LABEL} value={partner.partnerType} />
            </p>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
              {partner.description || 'Chưa có phần giới thiệu công khai.'}
            </p>
          </div>
        </div>
        <div className="border-t px-6 py-5">
          <DetailGrid columns={3}>
            <DetailField
              label="Đường dẫn"
              value={<CopyableCode value={`/${partner.slug}`} label="đường dẫn đối tác" />}
            />
            <DetailField label="Số điện thoại" value={contact.phone} />
            <DetailField
              label="Khu vực"
              value={[contact.wardName, contact.provinceName].filter(Boolean).join(', ') || null}
            />
            <DetailField label="Địa chỉ" value={contact.address} span={2} />
            <DetailField
              label="Xác minh lúc"
              value={partner.verifiedAt ? <DateTimeValue iso={partner.verifiedAt} /> : null}
            />
          </DetailGrid>
        </div>
      </section>

      {partner.verificationStatus === 'rejected' && identity.reviewNote ? (
        <Alert variant="destructive">
          <CircleAlert className="size-4" />
          <AlertTitle>Danh tính bị từ chối</AlertTitle>
          <AlertDescription>{identity.reviewNote}</AlertDescription>
        </Alert>
      ) : null}

      {partner.status === 'pending' ? (
        <div className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning-foreground">
          Hồ sơ đang chờ tenant duyệt. Bạn có thể đăng tin sau khi hồ sơ được phê duyệt.
        </div>
      ) : null}

      {taxAssessment ? <PartnerTaxAssessmentCard assessment={taxAssessment} canDeclare /> : null}

      {actionData?.intent === 'declare-tax-revenue' && !actionData.ok ? (
        <Alert variant="destructive">
          <CircleAlert className="size-4" />
          <AlertDescription>{actionData.error}</AlertDescription>
        </Alert>
      ) : null}

      <FormSurface>
        <ProfileIdentityCard partner={partner} result={resultFor('identity')} />
        <ProfilePayoutCard partner={partner} result={resultFor('payout')} />
        <ProfileDocumentsCard partner={partner} result={resultFor('documents')} />
        <Section
          title="Thỏa thuận"
          description="Các phiên bản điều khoản đã được hệ thống ghi nhận."
        >
          <div id="agreements" className="scroll-mt-6">
            {agreements.length ? (
              <DetailGrid columns={2}>
                {agreements.map((agreement) => (
                  <DetailField
                    key={`${agreement.agreementType}:${agreement.version}:${agreement.acceptedAt}`}
                    label={
                      agreement.agreementType === 'partner_terms'
                        ? 'Điều khoản đối tác'
                        : agreement.agreementType === 'commission_schedule'
                          ? 'Biểu phí hoa hồng'
                          : 'Tài trợ khuyến mãi'
                    }
                    value={
                      <span className="space-y-1">
                        <span className="block font-medium">Phiên bản {agreement.version}</span>
                        <span className="block text-xs text-muted-foreground">
                          Ghi nhận <DateTimeValue iso={agreement.acceptedAt} />
                        </span>
                      </span>
                    }
                  />
                ))}
              </DetailGrid>
            ) : (
              <p className="text-sm text-muted-foreground">
                Chưa có phiên bản thỏa thuận nào được ghi nhận.
              </p>
            )}
          </div>
        </Section>
      </FormSurface>
    </div>
  );
}
