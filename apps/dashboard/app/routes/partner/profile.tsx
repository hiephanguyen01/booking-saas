import { CircleAlert } from 'lucide-react';
import type { PartnerResponse } from '@booking/contracts';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@booking/ui/components/ui/card';
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

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Hồ sơ đối tác · Đối tác · Bookify' }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { auth, can } = await requirePartner(request);
  const canManage = can('partner.profile.manage');
  // GET /partner/profile is guarded by `partner.profile.manage` (it exposes the
  // payout account + ID number). Only fetch when the caller holds it.
  if (!canManage) {
    return { canManage: false as const, partner: null, loadError: null as string | null };
  }
  const res = await apiGet<PartnerResponse>('/partner/profile', auth);
  return {
    canManage: true as const,
    partner: res.ok && res.data ? res.data : null,
    loadError: res.ok ? null : (res.error ?? 'Không tải được hồ sơ đối tác.'),
  };
}

export async function action({ request }: Route.ActionArgs) {
  const { auth } = await requirePartner(request);
  return runPartnerProfileAction(request, auth);
}

export default function PartnerProfile({ loaderData, actionData }: Route.ComponentProps) {
  const { canManage, partner, loadError } = loaderData;

  const resultFor = (intent: PartnerProfileIntent): PartnerProfileActionResult | null =>
    actionData && actionData.intent === intent ? actionData : null;

  if (!canManage) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Hồ sơ đối tác"
          description="Thông tin, định danh và tài khoản nhận tiền."
        />
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Bạn không có quyền xem và chỉnh sửa hồ sơ đối tác.
          </CardContent>
        </Card>
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
        title={partner.name}
        description="Thông tin, định danh và tài khoản nhận tiền của bạn."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <PartnerStatusBadge status={partner.status} />
            <PartnerVerificationBadge status={partner.verificationStatus} />
          </div>
        }
      />

      {/* 1 · Trạng thái */}
      <Card>
        <CardHeader>
          <CardTitle>Trạng thái hồ sơ</CardTitle>
          <CardDescription>Tình trạng duyệt đối tác và xác minh danh tính.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <DetailGrid columns={3}>
            <DetailField
              label="Trạng thái đối tác"
              value={<PartnerStatusBadge status={partner.status} />}
            />
            <DetailField
              label="Xác minh danh tính"
              value={<PartnerVerificationBadge status={partner.verificationStatus} />}
            />
            <DetailField
              label="Đã xác minh lúc"
              value={partner.verifiedAt ? <DateTimeValue iso={partner.verifiedAt} /> : null}
            />
          </DetailGrid>

          {partner.verificationStatus === 'rejected' && identity.reviewNote ? (
            <Alert variant="destructive">
              <CircleAlert className="size-4" />
              <AlertTitle>Danh tính bị từ chối</AlertTitle>
              <AlertDescription>{identity.reviewNote}</AlertDescription>
            </Alert>
          ) : null}

          {partner.status === 'pending' ? (
            <div className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning-foreground">
              Hồ sơ đang chờ tenant duyệt. Bạn sẽ có thể đăng listing sau khi được duyệt.
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* 2 · Hồ sơ */}
      <Card>
        <CardHeader>
          <CardTitle>Hồ sơ</CardTitle>
          <CardDescription>Thông tin công khai của đối tác.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt="Logo đối tác"
                className="size-20 shrink-0 rounded-lg border border-border object-cover"
              />
            ) : (
              <div className="flex size-20 shrink-0 items-center justify-center rounded-lg border border-dashed border-border text-xs text-muted-foreground">
                Chưa có logo
              </div>
            )}
            <DetailGrid columns={2} className="flex-1">
              <DetailField label="Tên đối tác" value={partner.name} emphasis="strong" />
              <DetailField
                label="Loại đối tác"
                value={<EnumValue map={PARTNER_TYPE_LABEL} value={partner.partnerType} />}
              />
              <DetailField
                label="Đường dẫn"
                value={<CopyableCode value={`/${partner.slug}`} label="đường dẫn đối tác" />}
              />
              <DetailField
                label="Giới thiệu"
                value={partner.description}
                span={2}
                omitWhenEmpty={false}
              />
            </DetailGrid>
          </div>
        </CardContent>
      </Card>

      {/* 3 · Liên hệ */}
      <Card>
        <CardHeader>
          <CardTitle>Liên hệ</CardTitle>
          <CardDescription>Thông tin liên hệ đã cung cấp khi đăng ký.</CardDescription>
        </CardHeader>
        <CardContent>
          <DetailGrid columns={2}>
            <DetailField label="Số điện thoại" value={contact.phone} />
            <DetailField
              label="Khu vực"
              value={[contact.wardName, contact.provinceName].filter(Boolean).join(', ') || null}
            />
            <DetailField label="Địa chỉ" value={contact.address} span={2} />
          </DetailGrid>
        </CardContent>
      </Card>

      {/* 4 · Danh tính */}
      <ProfileIdentityCard partner={partner} result={resultFor('identity')} />

      {/* 5 · Tài khoản nhận tiền */}
      <ProfilePayoutCard partner={partner} result={resultFor('payout')} />

      {/* 6 · Giấy tờ */}
      <ProfileDocumentsCard partner={partner} result={resultFor('documents')} />
    </div>
  );
}
