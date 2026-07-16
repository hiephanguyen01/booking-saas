import { Link, useFetcher, data as routeData } from 'react-router';
import type {
  AffiliateDetailResponse,
  AffiliateCommissionStatusDto,
  AffiliateRateResponse,
  AffiliateRateSourceDto,
  AffiliateStatusResponse,
  ReferralTargetDto,
} from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@booking/ui/components/ui/card';
import { Alert, AlertDescription } from '@booking/ui/components/ui/alert';
import { Input } from '@booking/ui/components/ui/input';
import { DataTable, type DataTableColumn } from '@booking/ui/components/data-table/data-table';
import { DetailSection } from '@booking/ui/components/detail/detail-section';
import { DetailGrid } from '@booking/ui/components/detail/detail-grid';
import { DetailField } from '@booking/ui/components/detail/detail-field';
import { ArrowLeft, Ban, Check, CheckCircle2, TriangleAlert } from 'lucide-react';
import type { Route } from './+types/detail';
import { apiGet, apiPatch, apiPost } from '~/lib/api.server';
import { requireTenant } from '../tenant.server';
import { formatRate } from '~/lib/format';
import { PageHeader } from '~/components/page-header';
import { StatCard } from '~/components/stat-card';
import { Money } from '~/components/money';
import { EntityRef } from '~/components/entity-ref';
import { CopyableCode } from '~/components/copyable-code';
import { DateTimeValue } from '~/components/date-time-value';
import { EnumValue } from '~/components/enum-value';
import { PartnerStatusBadge } from '~/components/status-badge';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Cộng tác viên · Chi tiết · Bookify' }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { auth } = await requireTenant(request, 'tenant.affiliates.manage');
  const res = await apiGet<AffiliateDetailResponse>(`/tenant/affiliates/${params.affiliateId}`, auth);
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
      return routeData({ ok: false, error: 'Trạng thái không hợp lệ.', message: null }, { status: 400 });
    }
    const res = await apiPost<AffiliateStatusResponse>(`/tenant/affiliates/${id}/status`, { status }, auth);
    if (!res.ok) {
      return routeData({ ok: false, error: res.error ?? 'Không cập nhật được.', message: null }, { status: 400 });
    }
    const applied = res.data?.status ?? status;
    return {
      ok: true,
      error: null,
      message: applied === 'approved' ? 'Đã duyệt cộng tác viên.' : 'Đã tạm ngưng cộng tác viên.',
    };
  }

  if (intent === 'rate') {
    const raw = String(form.get('customRate') ?? '').trim();
    const customRate = raw === '' ? null : raw;
    if (customRate !== null && !/^\d+$/.test(customRate)) {
      return routeData({ ok: false, error: 'Hoa hồng phải là số nguyên phần trăm.', message: null }, { status: 400 });
    }
    const res = await apiPatch<AffiliateRateResponse>(`/tenant/affiliates/${id}`, { customRate }, auth);
    if (!res.ok) {
      // The backend guard (platform% + affiliate% ≤ tenant%) returns a clear message.
      return routeData({ ok: false, error: res.error ?? 'Không lưu được hoa hồng.', message: null }, { status: 400 });
    }
    // Render the resolved rate the backend echoes back — clearing the override
    // falls back to the rule, whose number the caller could not otherwise know.
    const resolved = res.data;
    const rate = resolved ? describeRate(resolved.effectiveRate, resolved.effectiveRateType) : '';
    const message =
      resolved && resolved.customRate === null
        ? `Đã xoá hoa hồng riêng — áp dụng mức theo quy tắc: ${rate}.`
        : `Đã lưu hoa hồng riêng: ${rate}.`;
    return { ok: true, error: null, message };
  }

  return routeData({ ok: false, error: 'Thao tác không hợp lệ.', message: null }, { status: 400 });
}

const COMMISSION_STATUS_LABEL: Record<AffiliateCommissionStatusDto, string> = {
  pending: 'Chờ xác nhận',
  confirmed: 'Đã xác nhận',
  paid: 'Đã trả',
  reversed: 'Đã huỷ',
  clawed_back: 'Đã thu hồi',
};

const RATE_SOURCE_LABEL: Record<AffiliateRateSourceDto, string> = {
  custom: 'Hoa hồng riêng',
  rule: 'Theo quy tắc tenant',
  none: 'Chưa cấu hình',
};

const TARGET_LABEL: Record<ReferralTargetDto, string> = {
  tenant_home: 'Trang chủ',
  listing: 'Listing',
};

/** Resolved rate as a display string: `5%` (percent) or a VND amount (fixed). */
function describeRate(value: string, type: 'percent' | 'fixed'): string {
  return type === 'percent' ? `${value}%` : `${value} ₫`;
}

function CommissionStatusBadge({ status }: { status: AffiliateCommissionStatusDto }) {
  const tone =
    status === 'paid'
      ? 'text-emerald-600 dark:text-emerald-400'
      : status === 'confirmed'
        ? 'text-foreground'
        : status === 'pending'
          ? 'text-muted-foreground'
          : 'text-destructive';
  return (
    <span className={`text-sm font-medium ${tone}`}>
      <EnumValue map={COMMISSION_STATUS_LABEL} value={status} />
    </span>
  );
}

export default function AffiliateDetail({ loaderData, actionData }: Route.ComponentProps) {
  const { detail } = loaderData;
  const { affiliate, links, commissions } = detail;

  const commissionColumns: DataTableColumn<AffiliateDetailResponse['commissions'][number]>[] = [
    {
      header: 'Mã đặt chỗ',
      cell: (c) => (
        <EntityRef
          to={c.bookingId ? `/tenant/bookings/${c.bookingId}` : null}
          name={<span className="font-mono text-sm">{c.bookingCode ?? '—'}</span>}
        />
      ),
    },
    {
      header: 'Listing',
      cell: (c) => <span className="text-sm text-muted-foreground">{c.listingTitle ?? '—'}</span>,
      className: 'hidden md:table-cell',
      headClassName: 'hidden md:table-cell',
    },
    { header: 'Hoa hồng', cell: (c) => <Money value={c.amount} /> },
    {
      header: 'Giá trị đơn',
      cell: (c) => (c.bookingTotal ? <Money value={c.bookingTotal} /> : <span className="text-muted-foreground">—</span>),
      className: 'hidden lg:table-cell',
      headClassName: 'hidden lg:table-cell',
    },
    { header: 'Trạng thái', cell: (c) => <CommissionStatusBadge status={c.status} /> },
    {
      header: 'Ngày tạo',
      cell: (c) => <DateTimeValue iso={c.createdAt} className="text-sm text-muted-foreground" />,
      className: 'hidden sm:table-cell',
      headClassName: 'hidden sm:table-cell',
    },
    {
      header: 'Ngày trả',
      cell: (c) =>
        c.paidAt ? (
          <DateTimeValue iso={c.paidAt} className="text-sm text-muted-foreground" />
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
      className: 'hidden lg:table-cell',
      headClassName: 'hidden lg:table-cell',
    },
  ];

  const linkColumns: DataTableColumn<AffiliateDetailResponse['links'][number]>[] = [
    { header: 'Mã', cell: (l) => <CopyableCode value={l.code} label="mã giới thiệu" /> },
    {
      header: 'Đích',
      cell: (l) => (
        <span className="text-sm text-muted-foreground">
          <EnumValue map={TARGET_LABEL} value={l.target} />
          {l.target === 'listing' && l.listingTitle ? ` · ${l.listingTitle}` : ''}
        </span>
      ),
    },
    {
      header: 'Lượt click',
      cell: (l) => <span className="tabular-nums">{l.clicksCount}</span>,
      className: 'text-right',
      headClassName: 'text-right',
    },
    {
      header: 'Ngày tạo',
      cell: (l) => <DateTimeValue iso={l.createdAt} className="text-sm text-muted-foreground" />,
      className: 'hidden sm:table-cell',
      headClassName: 'hidden sm:table-cell',
    },
  ];

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="w-fit">
        <Link to="/tenant/affiliates">
          <ArrowLeft className="size-4" /> Cộng tác viên
        </Link>
      </Button>

      <PageHeader
        title={affiliate.userName}
        description={affiliate.userEmail}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <PartnerStatusBadge status={affiliate.status} />
            <StatusActions affiliate={affiliate} />
          </div>
        }
      />

      {actionData?.error ? (
        <Alert variant="destructive">
          <AlertDescription>{actionData.error}</AlertDescription>
        </Alert>
      ) : null}
      {actionData?.ok && actionData.message ? (
        <Alert className="border-emerald-500/40 text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 className="size-4" />
          <AlertDescription>{actionData.message}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Hồ sơ</CardTitle>
            </CardHeader>
            <CardContent>
              <DetailGrid columns={1}>
                <DetailField
                  label="Trạng thái"
                  value={<PartnerStatusBadge status={affiliate.status} />}
                />
                <DetailField label="Email" value={affiliate.userEmail} />
                <DetailField label="Điện thoại" value={affiliate.phone ?? ''} />
                <DetailField
                  label="Tham gia"
                  value={<DateTimeValue iso={affiliate.createdAt} />}
                />
              </DetailGrid>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Hoa hồng riêng</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <RateForm currentRate={affiliate.customRate} />
              <DetailGrid columns={1}>
                <DetailField
                  label="Mức áp dụng"
                  emphasis="strong"
                  value={describeRate(affiliate.effectiveRate, affiliate.effectiveRateType)}
                  hint={RATE_SOURCE_LABEL[affiliate.effectiveRateSource]}
                />
              </DetailGrid>
              <p className="text-xs text-muted-foreground">
                Để trống để dùng mức hoa hồng theo quy tắc của tenant. Ưu tiên: hoa hồng riêng &gt; quy
                tắc &gt; mặc định.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Tài khoản nhận tiền</CardTitle>
            </CardHeader>
            <CardContent>
              <PayoutInfo payoutInfo={affiliate.payoutInfo} />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Thu nhập</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <StatCard label="Chờ xác nhận" value={<Money value={affiliate.pendingCommission} />} tone="muted" />
                <StatCard
                  label="Cần chi (đã xác nhận)"
                  value={<Money value={affiliate.confirmedCommission} />}
                  tone="positive"
                />
                <StatCard label="Đã chi" value={<Money value={affiliate.paidCommission} />} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <StatCard
                  label="Đã huỷ"
                  value={<Money value={affiliate.reversedCommission} />}
                  hint="Hoa hồng bị huỷ trước khi hoàn tất — không phải chi."
                  tone="muted"
                />
                <StatCard
                  label="Đã thu hồi"
                  value={<Money value={affiliate.clawedBackCommission} />}
                  hint="Hoa hồng bị thu hồi sau tranh chấp/hoàn tiền."
                  tone="warning"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Hiệu quả</CardTitle>
            </CardHeader>
            <CardContent>
              <DetailGrid columns={3}>
                <DetailField label="Lượt click" value={<span className="tabular-nums">{affiliate.clicks}</span>} />
                <DetailField label="Đơn đặt" value={<span className="tabular-nums">{affiliate.bookings}</span>} />
                <DetailField label="Tỷ lệ chuyển đổi" value={formatRate(affiliate.conversionRate)} />
              </DetailGrid>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <DetailSection title={`Link giới thiệu (${links.length})`} emptyMessage="Chưa có link nào.">
                {links.length > 0 ? (
                  <DataTable columns={linkColumns} data={links} getRowKey={(l) => l.id} />
                ) : null}
              </DetailSection>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <DetailSection
                title={`Hoa hồng theo đơn (${commissions.length})`}
                emptyMessage="Chưa có hoa hồng nào."
              >
                {commissions.length > 0 ? (
                  <DataTable columns={commissionColumns} data={commissions} getRowKey={(c) => c.id} />
                ) : null}
              </DetailSection>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

/**
 * The affiliate's bank details — what the tenant pays into. Rendered with a
 * warning-toned empty state because a payout cannot be made without an account.
 * `note` alone doesn't count as payable details.
 */
function PayoutInfo({ payoutInfo }: { payoutInfo: AffiliateDetailResponse['affiliate']['payoutInfo'] }) {
  const hasAccount = Boolean(payoutInfo.bankName || payoutInfo.accountNo || payoutInfo.accountHolder);
  if (!hasAccount) {
    return (
      <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-warning-foreground dark:text-warning">
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
        <p>
          Cộng tác viên chưa cung cấp thông tin tài khoản. Không thể chi hoa hồng cho đến khi họ cập
          nhật trong cổng cộng tác viên.
        </p>
      </div>
    );
  }
  return (
    <DetailGrid columns={1}>
      <DetailField label="Ngân hàng" value={payoutInfo.bankName ?? ''} />
      <DetailField label="Số tài khoản" value={payoutInfo.accountNo ?? ''} emphasis="strong" />
      <DetailField label="Chủ tài khoản" value={payoutInfo.accountHolder ?? ''} />
      {payoutInfo.note ? <DetailField label="Ghi chú" value={payoutInfo.note} /> : null}
    </DetailGrid>
  );
}

function StatusActions({ affiliate }: { affiliate: AffiliateDetailResponse['affiliate'] }) {
  const fetcher = useFetcher<typeof action>();
  const busy = fetcher.state !== 'idle';
  const next = affiliate.status === 'approved' ? 'suspended' : 'approved';

  return (
    <fetcher.Form method="post">
      <input type="hidden" name="intent" value="status" />
      <input type="hidden" name="status" value={next} />
      {next === 'approved' ? (
        <Button type="submit" size="sm" disabled={busy}>
          <Check className="size-4" /> Duyệt
        </Button>
      ) : (
        <Button type="submit" variant="outline" size="sm" disabled={busy}>
          <Ban className="size-4" /> Tạm ngưng
        </Button>
      )}
    </fetcher.Form>
  );
}

function RateForm({ currentRate }: { currentRate: string | null }) {
  const fetcher = useFetcher<typeof action>();
  const busy = fetcher.state !== 'idle';
  return (
    <fetcher.Form method="post" className="flex items-center gap-2">
      <input type="hidden" name="intent" value="rate" />
      <div className="relative flex-1">
        <Input
          name="customRate"
          type="number"
          min={0}
          max={100}
          defaultValue={currentRate ?? ''}
          placeholder="Theo quy tắc"
          // pr-7 trails the control's px-4 so the "%" suffix stays clear.
          className="pr-7"
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
          %
        </span>
      </div>
      <Button type="submit" size="sm" disabled={busy}>
        Lưu
      </Button>
    </fetcher.Form>
  );
}
