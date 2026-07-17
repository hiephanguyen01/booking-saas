import { Form, data as routeData, useNavigation } from 'react-router';
import { CheckCircle2, CircleAlert, Trash2 } from 'lucide-react';
import type {
  IdentityDocumentType,
  PartnerResponse,
  PartnerType,
  SubmitIdentityInput,
  UpdatePartnerDocumentsInput,
  UpdatePayoutInfoInput,
} from '@booking/contracts';
import {
  submitIdentityInputSchema,
  updatePartnerDocumentsInputSchema,
  updatePayoutInfoInputSchema,
} from '@booking/contracts';
import { GenericForm } from '@booking/ui/components/form/generic-form';
import type { FieldConfig } from '@booking/ui/components/form/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@booking/ui/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@booking/ui/components/ui/alert';
import { Button } from '@booking/ui/components/ui/button';
import { DetailGrid } from '@booking/ui/components/detail/detail-grid';
import { DetailField } from '@booking/ui/components/detail/detail-field';
import type { Route } from './+types/profile';
import { apiGet, apiPatch, apiPost } from '~/lib/api.server';
import { requirePartner, canPartner } from '~/features/partner/server/partner.server';
import { PageHeader } from '~/components/page-header';
import { PartnerStatusBadge, PartnerVerificationBadge } from '~/components/status-badge';
import { DateTimeValue } from '~/components/date-time-value';
import { EnumValue } from '~/components/enum-value';
import { CopyableCode } from '~/components/copyable-code';
import { PhotoStrip } from '~/components/photo-strip';
import { formatDate, PARTNER_TYPE_LABEL } from '~/lib/format';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Hồ sơ đối tác · Đối tác · Bookify' }];
}

const IDENTITY_DOC_LABEL: Record<IdentityDocumentType, string> = {
  national_id: 'CCCD / CMND',
  passport: 'Hộ chiếu',
  driver_license: 'Giấy phép lái xe',
};

const PARTNER_TYPE_MAP: Record<PartnerType, string> = {
  individual: PARTNER_TYPE_LABEL.individual,
  company: PARTNER_TYPE_LABEL.company,
};

// ── loader ──────────────────────────────────────────────────────────────────

export async function loader({ request }: Route.LoaderArgs) {
  const { auth, membership } = await requirePartner(request);
  const canManage = canPartner(membership, 'partner.profile.manage');
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

// ── action ──────────────────────────────────────────────────────────────────

type Intent = 'payout' | 'identity' | 'documents' | 'deleteDoc';

interface ActionResult {
  intent: Intent | '';
  ok: boolean;
  error: string | null;
  fieldErrors: Record<string, string[] | undefined> | null;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === 'string' && v.length > 0)
    : [];
}

export async function action({ request }: Route.ActionArgs) {
  const { auth } = await requirePartner(request);
  const contentType = request.headers.get('content-type') ?? '';

  // GenericForm submissions arrive as JSON with an `intent` discriminator.
  if (contentType.includes('application/json')) {
    const body = (await request.json()) as Record<string, unknown>;
    const intent = typeof body.intent === 'string' ? (body.intent as Intent) : '';

    if (intent === 'payout') {
      const parsed = updatePayoutInfoInputSchema.safeParse(body);
      if (!parsed.success) {
        return routeData<ActionResult>(
          { intent, ok: false, error: null, fieldErrors: parsed.error.flatten().fieldErrors },
          { status: 400 },
        );
      }
      const res = await apiPatch('/partner/profile/payout', parsed.data, auth);
      if (!res.ok) {
        return routeData<ActionResult>(
          { intent, ok: false, error: res.error ?? 'Không lưu được tài khoản nhận tiền.', fieldErrors: null },
          { status: 400 },
        );
      }
      return { intent, ok: true, error: null, fieldErrors: null } satisfies ActionResult;
    }

    if (intent === 'identity') {
      const parsed = submitIdentityInputSchema.safeParse(body);
      if (!parsed.success) {
        return routeData<ActionResult>(
          { intent, ok: false, error: null, fieldErrors: parsed.error.flatten().fieldErrors },
          { status: 400 },
        );
      }
      const res = await apiPost('/partner/profile/identity', parsed.data, auth);
      if (!res.ok) {
        return routeData<ActionResult>(
          { intent, ok: false, error: res.error ?? 'Không gửi được thông tin định danh.', fieldErrors: null },
          { status: 400 },
        );
      }
      return { intent, ok: true, error: null, fieldErrors: null } satisfies ActionResult;
    }

    if (intent === 'documents') {
      const parsed = updatePartnerDocumentsInputSchema.safeParse(body);
      if (!parsed.success) {
        return routeData<ActionResult>(
          { intent, ok: false, error: null, fieldErrors: parsed.error.flatten().fieldErrors },
          { status: 400 },
        );
      }
      // Only forward set keys, and APPEND new license docs onto the existing set
      // (the PATCH replaces the array — appending here keeps previous documents).
      const payload: UpdatePartnerDocumentsInput = {};
      if (parsed.data.logoUrl) payload.logoUrl = parsed.data.logoUrl;
      if (parsed.data.licenseDocs && parsed.data.licenseDocs.length > 0) {
        const current = await apiGet<PartnerResponse>('/partner/profile', auth);
        const existing =
          current.ok && current.data ? readStringArray(current.data.businessInfo.licenseDocs) : [];
        payload.licenseDocs = [...existing, ...parsed.data.licenseDocs].slice(0, 20);
      }
      const res = await apiPatch('/partner/profile/documents', payload, auth);
      if (!res.ok) {
        return routeData<ActionResult>(
          { intent, ok: false, error: res.error ?? 'Không lưu được giấy tờ.', fieldErrors: null },
          { status: 400 },
        );
      }
      return { intent, ok: true, error: null, fieldErrors: null } satisfies ActionResult;
    }

    return routeData<ActionResult>(
      { intent: '', ok: false, error: 'Hành động không hợp lệ.', fieldErrors: null },
      { status: 400 },
    );
  }

  // Plain form posts: deleting a single license document.
  const form = await request.formData();
  const intent = String(form.get('intent') ?? '');
  if (intent === 'deleteDoc') {
    const url = String(form.get('url') ?? '');
    const current = await apiGet<PartnerResponse>('/partner/profile', auth);
    if (!current.ok || !current.data) {
      return routeData<ActionResult>(
        { intent, ok: false, error: 'Không tải được hồ sơ.', fieldErrors: null },
        { status: 400 },
      );
    }
    const next = readStringArray(current.data.businessInfo.licenseDocs).filter((d) => d !== url);
    const res = await apiPatch('/partner/profile/documents', { licenseDocs: next }, auth);
    if (!res.ok) {
      return routeData<ActionResult>(
        { intent, ok: false, error: res.error ?? 'Không xoá được giấy tờ.', fieldErrors: null },
        { status: 400 },
      );
    }
    return { intent, ok: true, error: null, fieldErrors: null } satisfies ActionResult;
  }

  return routeData<ActionResult>(
    { intent: '', ok: false, error: 'Hành động không hợp lệ.', fieldErrors: null },
    { status: 400 },
  );
}

// ── field configs ─────────────────────────────────────────────────────────────

const identityFields: FieldConfig<SubmitIdentityInput>[] = [
  {
    name: 'documentType',
    type: 'select',
    label: 'Loại giấy tờ',
    required: true,
    options: [
      { value: 'national_id', label: IDENTITY_DOC_LABEL.national_id },
      { value: 'passport', label: IDENTITY_DOC_LABEL.passport },
      { value: 'driver_license', label: IDENTITY_DOC_LABEL.driver_license },
    ],
  },
  { name: 'documentNumber', type: 'text', label: 'Số giấy tờ', required: true },
  { name: 'holderName', type: 'text', label: 'Họ tên trên giấy tờ', required: true },
  {
    name: 'dateOfBirth',
    type: 'text',
    label: 'Ngày sinh',
    placeholder: 'YYYY-MM-DD',
    description: 'Định dạng năm-tháng-ngày, ví dụ 1998-05-20.',
    required: true,
  },
];

const payoutFields: FieldConfig<UpdatePayoutInfoInput>[] = [
  { name: 'bank', type: 'text', label: 'Ngân hàng', required: true },
  { name: 'accountNumber', type: 'text', label: 'Số tài khoản', required: true },
  { name: 'holderName', type: 'text', label: 'Chủ tài khoản', required: true },
];

const documentFields: FieldConfig<UpdatePartnerDocumentsInput>[] = [
  {
    name: 'logoUrl',
    type: 'file',
    target: 'partners',
    label: 'Logo đối tác',
    description: 'Hình đại diện hiển thị với khách sau khi đặt.',
  },
  {
    name: 'licenseDocs',
    type: 'file',
    target: 'partners',
    multiple: true,
    maxFiles: 10,
    label: 'Tải thêm giấy tờ',
    description: 'Ảnh mới sẽ được thêm vào danh sách giấy tờ hiện có.',
  },
];

// ── helpers ────────────────────────────────────────────────────────────────

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

// ── component ────────────────────────────────────────────────────────────────

export default function PartnerProfile({ loaderData, actionData }: Route.ComponentProps) {
  const { canManage, partner, loadError } = loaderData;
  const nav = useNavigation();
  const busy = nav.state !== 'idle';

  const resultFor = (intent: Intent): ActionResult | null =>
    actionData && actionData.intent === intent ? actionData : null;

  if (!canManage) {
    return (
      <div className="space-y-6">
        <PageHeader title="Hồ sơ đối tác" description="Thông tin, định danh và tài khoản nhận tiền." />
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
        <PageHeader title="Hồ sơ đối tác" description="Thông tin, định danh và tài khoản nhận tiền." />
        <Alert variant="destructive">
          <CircleAlert className="size-4" />
          <AlertDescription>{loadError ?? 'Không tải được hồ sơ đối tác.'}</AlertDescription>
        </Alert>
      </div>
    );
  }

  const logoUrl = readString(partner.businessInfo.logoUrl);
  const licenseDocs = readStringArray(partner.businessInfo.licenseDocs);
  const payout = partner.payoutInfo as Record<string, unknown>;
  const identity = partner.identityInfo;
  const contact = partner.contactInfo;

  const payoutResult = resultFor('payout');
  const identityResult = resultFor('identity');
  const documentsResult = resultFor('documents');

  const payoutDefaults = {
    bank: readString(payout.bank),
    accountNumber: readString(payout.accountNumber),
    holderName: readString(payout.holderName),
  };

  const identityDefaults = {
    documentType: identity.documentType ?? undefined,
    documentNumber: identity.documentNumber ?? '',
    holderName: identity.holderName ?? '',
    dateOfBirth: partner.dateOfBirth ? partner.dateOfBirth.slice(0, 10) : '',
  };

  const documentDefaults = {
    logoUrl,
    licenseDocs: [] as string[],
  };

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
            <DetailField label="Trạng thái đối tác" value={<PartnerStatusBadge status={partner.status} />} />
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
                value={<EnumValue map={PARTNER_TYPE_MAP} value={partner.partnerType} />}
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
      <Card>
        <CardHeader>
          <CardTitle>Danh tính</CardTitle>
          <CardDescription>
            Gửi thông tin giấy tờ tuỳ thân để tenant xác minh. Cần thiết cho các loại listing gắn với con người.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <DetailGrid columns={2}>
            <DetailField
              label="Loại giấy tờ"
              value={
                identity.documentType ? (
                  <EnumValue map={IDENTITY_DOC_LABEL} value={identity.documentType} />
                ) : null
              }
            />
            <DetailField label="Số giấy tờ" value={identity.documentNumber} />
            <DetailField label="Họ tên trên giấy tờ" value={identity.holderName} />
            <DetailField
              label="Ngày sinh"
              value={partner.dateOfBirth ? formatDate(partner.dateOfBirth) : null}
            />
          </DetailGrid>

          {identityResult?.ok ? (
            <Alert className="border-emerald-500/40 text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="size-4" />
              <AlertDescription>Đã gửi thông tin định danh, chờ tenant xác minh.</AlertDescription>
            </Alert>
          ) : null}

          <div>
            <h3 className="mb-4 text-sm font-semibold">
              {identity.documentNumber ? 'Cập nhật / gửi lại định danh' : 'Gửi thông tin định danh'}
            </h3>
            <GenericForm
              schema={submitIdentityInputSchema}
              fields={identityFields}
              defaultValues={identityDefaults}
              columns={2}
              submitLabel="Gửi xác minh"
              method="post"
              transform={(v) => ({ ...v, intent: 'identity' })}
              serverError={identityResult?.error ?? null}
              fieldErrors={identityResult?.fieldErrors ?? null}
            />
          </div>
        </CardContent>
      </Card>

      {/* 5 · Tài khoản nhận tiền */}
      <Card>
        <CardHeader>
          <CardTitle>Tài khoản nhận tiền</CardTitle>
          <CardDescription>Nền tảng chi trả doanh thu về tài khoản này.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {payoutResult?.ok ? (
            <Alert className="border-emerald-500/40 text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="size-4" />
              <AlertDescription>Đã lưu tài khoản nhận tiền.</AlertDescription>
            </Alert>
          ) : null}
          <GenericForm
            schema={updatePayoutInfoInputSchema}
            fields={payoutFields}
            defaultValues={payoutDefaults}
            columns={2}
            submitLabel="Lưu tài khoản"
            method="patch"
            transform={(v) => ({ ...v, intent: 'payout' })}
            serverError={payoutResult?.error ?? null}
            fieldErrors={payoutResult?.fieldErrors ?? null}
          />
        </CardContent>
      </Card>

      {/* 6 · Giấy tờ */}
      <Card>
        <CardHeader>
          <CardTitle>Logo & giấy tờ</CardTitle>
          <CardDescription>
            Hình ảnh được tải trực tiếp lên kho lưu trữ; chỉ đường dẫn được lưu vào hồ sơ.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {documentsResult?.ok ? (
            <Alert className="border-emerald-500/40 text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="size-4" />
              <AlertDescription>Đã lưu giấy tờ.</AlertDescription>
            </Alert>
          ) : null}

          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Giấy tờ đã tải lên</h3>
            {licenseDocs.length === 0 ? (
              <p className="text-sm text-muted-foreground">Chưa có giấy tờ nào.</p>
            ) : (
              <div className="flex flex-wrap gap-3">
                {licenseDocs.map((url, i) => (
                  <div key={`${url}-${i}`} className="space-y-1.5">
                    <PhotoStrip photos={[url]} alt="Giấy tờ" />
                    <Form method="post">
                      <input type="hidden" name="intent" value="deleteDoc" />
                      <input type="hidden" name="url" value={url} />
                      <Button
                        type="submit"
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        className="h-8 w-full gap-1.5 text-destructive hover:text-destructive"
                      >
                        <Trash2 className="size-3.5" aria-hidden /> Xoá
                      </Button>
                    </Form>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-border pt-6">
            <h3 className="mb-4 text-sm font-semibold">Tải lên</h3>
            <GenericForm
              schema={updatePartnerDocumentsInputSchema}
              fields={documentFields}
              defaultValues={documentDefaults}
              submitLabel="Lưu giấy tờ"
              method="patch"
              transform={(v) => ({ ...v, intent: 'documents' })}
              serverError={documentsResult?.error ?? null}
              fieldErrors={documentsResult?.fieldErrors ?? null}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
