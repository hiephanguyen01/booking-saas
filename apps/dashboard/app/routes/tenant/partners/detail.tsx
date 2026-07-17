import { Form, Link, useNavigation, useSubmit, data as routeData } from 'react-router';
import type { IdentityDocumentType, PartnerResponse } from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import { Badge } from '@booking/ui/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@booking/ui/components/ui/card';
import { Alert, AlertDescription } from '@booking/ui/components/ui/alert';
import { Textarea } from '@booking/ui/components/ui/textarea';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@booking/ui/components/ui/alert-dialog';
import {
  ArrowLeft,
  CircleAlert,
  CircleCheck,
  Check,
  BadgeCheck,
  Ban,
  TriangleAlert,
} from 'lucide-react';
import type { Route } from './+types/detail';
import { apiGet, apiPost } from '~/lib/api.server';
import { requireTenant } from '~/features/tenant/server/tenant.server';
import { formatDate, PARTNER_TYPE_LABEL as TYPE_LABEL } from '~/lib/format';
import { readHttpUrl, readString } from '~/lib/records';
import { PageHeader } from '~/components/page-header';
import { DateTimeValue } from '~/components/date-time-value';
import { EnumValue } from '~/components/enum-value';
import { CopyableCode } from '~/components/copyable-code';
import { PhotoStrip } from '~/components/photo-strip';
import { PartnerStatusBadge, PartnerVerificationBadge } from '~/components/status-badge';
import { DetailSection } from '@booking/ui/components/detail/detail-section';
import { DetailGrid } from '@booking/ui/components/detail/detail-grid';
import { DetailField } from '@booking/ui/components/detail/detail-field';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Chi tiết đối tác · Tenant · Bookify' }];
}

/** Identity-document type → Vietnamese label (no shared map exists yet). */
const DOCUMENT_TYPE_LABEL: Record<IdentityDocumentType, string> = {
  national_id: 'CCCD/CMND',
  passport: 'Hộ chiếu',
  driver_license: 'Giấy phép lái xe',
};

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
  const nav = useNavigation();
  const submit = useSubmit();
  const busy = nav.state !== 'idle';

  const payout = partner.payoutInfo as {
    bank?: string;
    accountNumber?: string;
    holderName?: string;
  };
  const hasPayout = Boolean(payout?.bank || payout?.accountNumber || payout?.holderName);
  const contact = partner.contactInfo;
  const identity = partner.identityInfo;
  const business = readBusinessInfo(partner.businessInfo);
  const locality = [contact.wardName, contact.provinceName].filter(Boolean).join(', ');

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="w-fit">
        <Link to="/tenant/partners">
          <ArrowLeft className="size-4" /> Đối tác
        </Link>
      </Button>

      <PageHeader
        title={partner.name}
        description={`/${partner.slug}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {partner.isHouse ? <Badge variant="outline">Nội bộ</Badge> : null}
            <Badge variant="secondary">{TYPE_LABEL[partner.partnerType] ?? partner.partnerType}</Badge>
            <PartnerStatusBadge status={partner.status} />
            <PartnerVerificationBadge status={partner.verificationStatus} />
          </div>
        }
      />

      {error ? (
        <Alert variant="destructive">
          <CircleAlert className="size-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {success ? (
        <Alert>
          <CircleCheck className="size-4" />
          <AlertDescription>{successMessage(success)}</AlertDescription>
        </Alert>
      ) : null}

      {/* Contact snapshot — who to reach and where the partner operates. */}
      <Card>
        <CardHeader>
          <CardTitle>Liên hệ</CardTitle>
          <CardDescription>Thông tin liên hệ đối tác cung cấp khi đăng ký.</CardDescription>
        </CardHeader>
        <CardContent>
          <DetailGrid>
            <DetailField
              label="Số điện thoại"
              value={contact.phone ? <TelLink phone={contact.phone} /> : null}
            />
            <DetailField
              label="Email chủ sở hữu"
              value={partner.owner?.email ? <MailLink email={partner.owner.email} /> : null}
            />
            <DetailField label="Khu vực" value={locality || null} />
            <DetailField label="Địa chỉ" value={contact.address} span={2} />
          </DetailGrid>
        </CardContent>
      </Card>

      {/* Identity — the whole point: metadata to reconcile against the ID scans. */}
      <Card>
        <CardHeader>
          <CardTitle>Danh tính</CardTitle>
          <CardDescription>
            Đối chiếu thông tin dưới đây với ảnh giấy tờ. Hệ thống từ chối nếu dưới 18 tuổi hoặc tên
            không khớp tài khoản nhận tiền.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <DetailGrid>
            <DetailField
              label="Loại giấy tờ"
              value={
                identity.documentType ? (
                  <EnumValue map={DOCUMENT_TYPE_LABEL} value={identity.documentType} />
                ) : null
              }
            />
            <DetailField
              label="Số giấy tờ"
              value={
                identity.documentNumber ? (
                  <CopyableCode value={identity.documentNumber} label="số giấy tờ" />
                ) : null
              }
            />
            <DetailField label="Họ tên trên giấy tờ" value={identity.holderName} />
            <DetailField label="Người đại diện" value={business.representativeName} />
            <DetailField
              label="Ngày sinh"
              value={partner.dateOfBirth ? formatDate(partner.dateOfBirth) : null}
            />
            {identity.reviewNote ? (
              <DetailField
                span={2}
                label={partner.verificationStatus === 'rejected' ? 'Lý do từ chối' : 'Ghi chú xét duyệt'}
                value={
                  <span
                    className={
                      partner.verificationStatus === 'rejected' ? 'text-warning' : undefined
                    }
                  >
                    {identity.reviewNote}
                  </span>
                }
              />
            ) : null}
          </DetailGrid>

          <DetailSection
            title="Ảnh giấy tờ tuỳ thân"
            emptyMessage="Đối tác chưa tải ảnh giấy tờ tuỳ thân."
          >
            {business.identityPhotos.length > 0 ? (
              <PhotoStrip photos={business.identityPhotos} alt="Giấy tờ tuỳ thân" />
            ) : null}
          </DetailSection>
        </CardContent>
      </Card>

      {/* Payout — ALWAYS rendered: an empty payout hard-fails verification. */}
      <Card>
        <CardHeader>
          <CardTitle>Tài khoản nhận tiền</CardTitle>
          <CardDescription>Dùng để chi trả doanh thu — tên chủ tài khoản phải khớp giấy tờ.</CardDescription>
        </CardHeader>
        <CardContent>
          {hasPayout ? (
            <DetailGrid>
              <DetailField label="Ngân hàng" value={payout.bank} />
              <DetailField label="Số tài khoản" value={payout.accountNumber} />
              <DetailField label="Chủ tài khoản" value={payout.holderName} span={2} />
            </DetailGrid>
          ) : (
            <div className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 p-4">
              <TriangleAlert className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />
              <div className="space-y-1 text-sm">
                <p className="font-medium text-foreground">Chưa có tài khoản nhận tiền</p>
                <p className="text-muted-foreground">
                  Không thể xác minh danh tính khi thiếu — hệ thống sẽ báo lỗi trùng khớp tên
                  (NAME_MISMATCH). Yêu cầu đối tác bổ sung trước khi duyệt.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Legal profile — business registration + license documents. Hidden for house partners. */}
      {!partner.isHouse ? (
        <Card>
          <CardHeader>
            <CardTitle>Hồ sơ pháp lý</CardTitle>
            <CardDescription>Thông tin và giấy phép đối tác đã cung cấp khi đăng ký.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {partner.description ? (
              <DetailGrid columns={1}>
                <DetailField label="Giới thiệu" value={partner.description} />
              </DetailGrid>
            ) : null}

            <DetailSection
              title="Thông tin pháp lý"
              emptyMessage="Đối tác chưa cung cấp thông tin pháp lý."
            >
              {business.legalDetails.length > 0 ? (
                <DetailGrid>
                  {business.legalDetails.map((detail) => (
                    <DetailField key={detail.label} label={detail.label} value={detail.value} />
                  ))}
                  {business.logoUrl ? (
                    <DetailField
                      label="Logo"
                      value={<PhotoStrip photos={[business.logoUrl]} alt="Logo đối tác" />}
                      span={2}
                    />
                  ) : null}
                </DetailGrid>
              ) : business.logoUrl ? (
                <PhotoStrip photos={[business.logoUrl]} alt="Logo đối tác" />
              ) : null}
            </DetailSection>

            <DetailSection
              title="Giấy phép kinh doanh"
              emptyMessage="Đối tác chưa cung cấp giấy phép kinh doanh."
            >
              {business.licensePhotos.length > 0 ? (
                <PhotoStrip photos={business.licensePhotos} alt="Giấy phép" />
              ) : null}
            </DetailSection>
          </CardContent>
        </Card>
      ) : null}

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

      {/* Approve a pending application. */}
      {partner.status === 'pending' && canApprove ? (
        <Card>
          <CardHeader>
            <CardTitle>Duyệt đối tác</CardTitle>
            <CardDescription>
              Chấp thuận đối tác tham gia marketplace — họ sẽ có thể đăng listing.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form method="post">
              <input type="hidden" name="intent" value="approve" />
              <Button type="submit" disabled={busy}>
                <Check className="size-4" /> Duyệt đối tác
              </Button>
            </Form>
          </CardContent>
        </Card>
      ) : null}

      {/* Manual identity review once the partner has submitted documents. */}
      {partner.verificationStatus === 'pending' && canApprove ? (
        <Card>
          <CardHeader>
            <CardTitle>Xác minh danh tính</CardTitle>
            <CardDescription>
              Đối chiếu giấy tờ đã nộp. Hệ thống sẽ từ chối nếu dưới 18 tuổi hoặc tên không khớp.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form method="post" className="space-y-3">
              <input type="hidden" name="intent" value="verify" />
              <Textarea name="note" placeholder="Ghi chú xét duyệt (tuỳ chọn)…" rows={2} />
              <Button type="submit" disabled={busy}>
                <BadgeCheck className="size-4" /> Xác minh danh tính
              </Button>
            </Form>
          </CardContent>
        </Card>
      ) : null}

      {/* Suspend an approved partner — behind a confirmation dialog. */}
      {partner.status === 'approved' && canManage ? (
        <Card>
          <CardHeader>
            <CardTitle>Tạm ngưng đối tác</CardTitle>
            <CardDescription>
              Ẩn listing của đối tác khỏi storefront và chặn nhận đặt chỗ mới.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" disabled={busy}>
                  <Ban className="size-4" /> Tạm ngưng
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Tạm ngưng đối tác này?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Listing của đối tác sẽ bị ẩn khỏi storefront và không nhận đặt chỗ mới cho tới khi
                    được khôi phục.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Huỷ</AlertDialogCancel>
                  <AlertDialogAction
                    disabled={busy}
                    onClick={() => submit({ intent: 'suspend' }, { method: 'post' })}
                  >
                    Tạm ngưng
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>
      ) : null}
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

function TelLink({ phone }: { phone: string }) {
  return (
    <a
      href={`tel:${phone}`}
      className="rounded-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      {phone}
    </a>
  );
}

function MailLink({ email }: { email: string }) {
  return (
    <a
      href={`mailto:${email}`}
      className="rounded-sm break-all font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      {email}
    </a>
  );
}

interface BusinessInfoView {
  /** Legal text fields, de-duplicated so the same value is never labelled twice. */
  legalDetails: { label: string; value: string }[];
  representativeName: string | null;
  logoUrl: string | null;
  /** Personal ID card scans (front/back). */
  identityPhotos: string[];
  /** Business-license scans + any extra license documents. */
  licensePhotos: string[];
}

function readBusinessInfo(raw: Record<string, unknown>): BusinessInfoView {
  const seenValues = new Set<string>();
  const legalDetails: { label: string; value: string }[] = [];
  for (const { label, key } of [
    { label: 'Tên pháp lý', key: 'legalName' },
    { label: 'Tên doanh nghiệp', key: 'companyName' },
    { label: 'Mã số thuế', key: 'taxId' },
    { label: 'Số giấy phép kinh doanh', key: 'businessRegistrationNo' },
    { label: 'Số giấy phép/chứng chỉ', key: 'licenseNo' },
  ]) {
    const value = readString(raw[key]);
    if (value && !seenValues.has(value)) {
      seenValues.add(value);
      legalDetails.push({ label, value });
    }
  }

  const identityPhotos = collectUrls(raw, ['identityCardFrontUrl', 'identityCardBackUrl']);
  const licensePhotos = collectUrls(raw, ['businessLicenseFrontUrl', 'businessLicenseBackUrl']);
  if (Array.isArray(raw.licenseDocs)) {
    for (const value of raw.licenseDocs) {
      const url = readHttpUrl(value);
      if (url) licensePhotos.push(url);
    }
  }

  return {
    legalDetails,
    representativeName: readString(raw.representativeName),
    logoUrl: readHttpUrl(raw.logoUrl),
    identityPhotos,
    licensePhotos,
  };
}

function collectUrls(raw: Record<string, unknown>, keys: string[]): string[] {
  const urls: string[] = [];
  for (const key of keys) {
    const url = readHttpUrl(raw[key]);
    if (url) urls.push(url);
  }
  return urls;
}
