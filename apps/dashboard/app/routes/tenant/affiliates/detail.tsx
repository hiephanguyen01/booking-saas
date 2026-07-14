import { Link, useFetcher, data as routeData } from 'react-router';
import type { AffiliateDetailResponse, AffiliateCommissionStatusDto } from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@booking/ui/components/ui/card';
import { Badge } from '@booking/ui/components/ui/badge';
import { Input } from '@booking/ui/components/ui/input';
import { DataTable, type DataTableColumn } from '@booking/ui/components/data-table/data-table';
import { ArrowLeft } from 'lucide-react';
import type { Route } from './+types/detail';
import { apiGet, apiPatch, apiPost } from '~/lib/api.server';
import { requireTenant } from '../tenant.server';
import { formatDate, formatVnd } from '../format';
import { PageHeader } from '../components/page';

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
      return routeData({ error: 'Trạng thái không hợp lệ.', ok: false }, { status: 400 });
    }
    const res = await apiPost(`/tenant/affiliates/${id}/status`, { status }, auth);
    if (!res.ok) return routeData({ error: res.error ?? 'Không cập nhật được.', ok: false }, { status: 400 });
    return { ok: true, error: null };
  }

  if (intent === 'rate') {
    const raw = String(form.get('customRate') ?? '').trim();
    const customRate = raw === '' ? null : raw;
    if (customRate !== null && !/^\d+$/.test(customRate)) {
      return routeData({ error: 'Hoa hồng phải là số nguyên phần trăm.', ok: false }, { status: 400 });
    }
    const res = await apiPatch(`/tenant/affiliates/${id}`, { customRate }, auth);
    if (!res.ok) {
      // The backend guard (platform% + affiliate% ≤ tenant%) returns a clear message.
      return routeData({ error: res.error ?? 'Không lưu được hoa hồng.', ok: false }, { status: 400 });
    }
    return { ok: true, error: null };
  }

  return routeData({ error: 'Thao tác không hợp lệ.', ok: false }, { status: 400 });
}

const STATUS_LABEL: Record<AffiliateCommissionStatusDto, string> = {
  pending: 'Chờ',
  confirmed: 'Đã xác nhận',
  paid: 'Đã trả',
  reversed: 'Đã huỷ',
  clawed_back: 'Đã thu hồi',
};

function CommissionBadge({ status }: { status: AffiliateCommissionStatusDto }) {
  const variant =
    status === 'paid' ? 'default' : status === 'confirmed' ? 'secondary' : status === 'pending' ? 'outline' : 'destructive';
  return <Badge variant={variant}>{STATUS_LABEL[status]}</Badge>;
}

export default function AffiliateDetail({ loaderData, actionData }: Route.ComponentProps) {
  const { detail } = loaderData;
  const { affiliate, links, commissions } = detail;

  const commissionColumns: DataTableColumn<AffiliateDetailResponse['commissions'][number]>[] = [
    { header: 'Mã đặt chỗ', cell: (c) => <span className="font-mono text-sm">{c.bookingCode ?? '—'}</span> },
    { header: 'Số tiền', cell: (c) => <span className="tabular-nums">{formatVnd(c.amount)}</span> },
    { header: 'Trạng thái', cell: (c) => <CommissionBadge status={c.status} /> },
    {
      header: 'Ngày',
      cell: (c) => <span className="text-sm text-muted-foreground">{formatDate(c.createdAt)}</span>,
      className: 'hidden sm:table-cell',
      headClassName: 'hidden sm:table-cell',
    },
  ];

  const linkColumns: DataTableColumn<AffiliateDetailResponse['links'][number]>[] = [
    { header: 'Mã', cell: (l) => <span className="font-mono text-sm">{l.code}</span> },
    {
      header: 'Đích',
      cell: (l) => <span className="text-sm text-muted-foreground">{l.target === 'listing' ? 'Listing' : 'Trang chủ'}</span>,
    },
    { header: 'Lượt click', cell: (l) => <span className="tabular-nums">{l.clicksCount}</span> },
  ];

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="w-fit">
        <Link to="/tenant/affiliates">
          <ArrowLeft className="size-4" /> Cộng tác viên
        </Link>
      </Button>

      <PageHeader title={affiliate.userName} description={affiliate.userEmail} />

      {actionData?.error ? (
        <Card>
          <CardContent className="p-4 text-sm text-rose-600 dark:text-rose-400">{actionData.error}</CardContent>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Hoa hồng riêng</CardTitle>
            </CardHeader>
            <CardContent>
              <RateForm currentRate={affiliate.customRate} />
              <p className="mt-2 text-xs text-muted-foreground">
                Để trống để dùng mức hoa hồng theo quy tắc của tenant. Ưu tiên: hoa hồng riêng &gt; quy tắc &gt;
                mặc định.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Tổng đã kiếm</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold tabular-nums">{formatVnd(affiliate.totalEarned)}</div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <section className="space-y-3">
            <h2 className="text-sm font-medium text-muted-foreground">Link giới thiệu ({links.length})</h2>
            <DataTable columns={linkColumns} data={links} getRowKey={(l) => l.id} emptyMessage="Chưa có link nào." />
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-medium text-muted-foreground">Hoa hồng ({commissions.length})</h2>
            <DataTable
              columns={commissionColumns}
              data={commissions}
              getRowKey={(c) => c.id}
              emptyMessage="Chưa có hoa hồng nào."
            />
          </section>
        </div>
      </div>
    </div>
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
