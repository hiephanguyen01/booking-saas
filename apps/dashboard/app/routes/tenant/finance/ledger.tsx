import { Form, Link } from 'react-router';
import {
  ledgerEntryTypeSchema,
  type LedgerEntryResponse,
  type LedgerEntryTypeDto,
  type LedgerOwnerTypeDto,
  type Paginated,
} from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import { Card, CardContent } from '@booking/ui/components/ui/card';
import { Badge } from '@booking/ui/components/ui/badge';
import { Label } from '@booking/ui/components/ui/label';
import { Input } from '@booking/ui/components/ui/input';
import {
  NativeSelect,
  NativeSelectOption,
} from '@booking/ui/components/ui/native-select';
import { DataTable, type DataTableColumn } from '@booking/ui/components/data-table/data-table';
import { ArrowLeft, Filter } from 'lucide-react';
import type { Route } from './+types/ledger';
import { apiGet } from '~/lib/api.server';
import { requireTenant } from '~/features/tenant/server/tenant.server';
import { formatVnd, formatDateTime } from '~/lib/format';
import { PageHeader } from '~/components/page-header';
import { amountToneClass } from '~/components/money';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Sổ cái · Tài chính · Tenant · Bookify' }];
}

const PAGE_SIZE = 25;

/** VN market timezone offset — pins a `YYYY-MM-DD` filter bound to the local calendar day. */
const TZ_OFFSET = '+07:00';

/** Turn a `YYYY-MM-DD` form value into an ISO instant at the start/end of that local day. */
function boundIso(day: string, edge: 'start' | 'end'): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const time = edge === 'start' ? '00:00:00.000' : '23:59:59.999';
  const d = new Date(`${day}T${time}${TZ_OFFSET}`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** A validated `entryType` filter, or `''` when absent/invalid. */
function parseEntryType(raw: string | null): LedgerEntryTypeDto | '' {
  const r = ledgerEntryTypeSchema.safeParse(raw);
  return r.success ? r.data : '';
}

export async function loader({ request, url }: Route.LoaderArgs) {
  const { auth } = await requireTenant(request, 'tenant.finance.read');
  const page = Math.max(1, Number(url.searchParams.get('page') ?? '1') || 1);
  const entryType = parseEntryType(url.searchParams.get('entryType'));
  // Keep the raw `YYYY-MM-DD` for the date inputs; send ISO bounds to the API.
  const fromDay = url.searchParams.get('from') ?? '';
  const toDay = url.searchParams.get('to') ?? '';

  const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
  if (entryType) params.set('entryType', entryType);
  const fromIso = boundIso(fromDay, 'start');
  const toIso = boundIso(toDay, 'end');
  if (fromIso) params.set('from', fromIso);
  if (toIso) params.set('to', toIso);

  const res = await apiGet<Paginated<LedgerEntryResponse>>(
    `/tenant/finance/ledger?${params.toString()}`,
    auth,
  );

  return {
    page,
    filters: { entryType, from: fromDay, to: toDay },
    result: res.ok ? res.data : null,
    error: res.ok ? null : (res.error ?? 'Không tải được sổ cái.'),
  };
}

const OWNER_LABEL: Record<LedgerOwnerTypeDto, string> = {
  platform: 'Nền tảng',
  tenant: 'Cửa hàng',
  partner: 'Đối tác',
  affiliate: 'Affiliate',
};

const ENTRY_LABEL: Record<LedgerEntryTypeDto, string> = {
  booking_revenue: 'Doanh thu đặt chỗ',
  partner_share: 'Chia sẻ đối tác',
  platform_fee: 'Phí nền tảng',
  affiliate_commission: 'Hoa hồng affiliate',
  promo_discount: 'Giảm giá khuyến mãi',
  cancellation_fee: 'Phí huỷ',
  additional_charge: 'Phụ thu',
  security_deposit: 'Tiền cọc',
  damage_deduction: 'Khấu trừ hư hại',
  clawback: 'Thu hồi',
  refund: 'Hoàn tiền',
  payout: 'Chi trả',
};

/** First non-null reference on a ledger line, labelled for the table. */
function refLabel(e: LedgerEntryResponse): string {
  if (e.bookingId) return `Đơn ${e.bookingId.slice(0, 8)}`;
  if (e.paymentId) return `TT ${e.paymentId.slice(0, 8)}`;
  if (e.payoutId) return `Chi ${e.payoutId.slice(0, 8)}`;
  return '—';
}

const columns: DataTableColumn<LedgerEntryResponse>[] = [
  {
    header: 'Bút toán',
    cell: (e) => <span className="font-mono text-xs text-muted-foreground">{e.journalId.slice(0, 8)}</span>,
  },
  {
    header: 'Chủ tài khoản',
    // Prefer the server-resolved display name; null is expected for the platform owner
    // (and for a deleted owner) — the ownerType badge already labels the row in that case.
    cell: (e) => (
      <div className="flex flex-col gap-0.5">
        <Badge variant="secondary" className="w-fit">{OWNER_LABEL[e.ownerType] ?? e.ownerType}</Badge>
        {e.ownerName ? <span className="text-xs text-muted-foreground">{e.ownerName}</span> : null}
      </div>
    ),
  },
  {
    header: 'Loại bút toán',
    cell: (e) => <span className="text-sm">{ENTRY_LABEL[e.entryType] ?? e.entryType}</span>,
  },
  {
    header: 'Nợ',
    headClassName: 'text-right',
    className: 'text-right tabular-nums',
    cell: (e) =>
      e.debit && e.debit !== '0' ? (
        <span className={`font-medium ${amountToneClass('negative')}`}>{formatVnd(e.debit)}</span>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    header: 'Có',
    headClassName: 'text-right',
    className: 'text-right tabular-nums',
    cell: (e) =>
      e.credit && e.credit !== '0' ? (
        <span className={`font-medium ${amountToneClass('positive')}`}>{formatVnd(e.credit)}</span>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    header: 'Tham chiếu',
    className: 'hidden md:table-cell',
    headClassName: 'hidden md:table-cell',
    cell: (e) => <span className="font-mono text-xs text-muted-foreground">{refLabel(e)}</span>,
  },
  {
    header: 'Thời gian',
    headClassName: 'text-right',
    className: 'text-right tabular-nums text-muted-foreground',
    cell: (e) => formatDateTime(e.createdAt),
  },
];

export default function TenantLedger({ loaderData }: Route.ComponentProps) {
  const { result, error, page, filters } = loaderData;
  const items = result?.items ?? [];
  const total = result?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Preserve the active filters when paging (a bare `?page=` link would drop them).
  const pageHref = (p: number): string => {
    const q = new URLSearchParams();
    if (filters.entryType) q.set('entryType', filters.entryType);
    if (filters.from) q.set('from', filters.from);
    if (filters.to) q.set('to', filters.to);
    q.set('page', String(p));
    return `?${q.toString()}`;
  };
  const hasFilters = filters.entryType !== '' || filters.from !== '' || filters.to !== '';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sổ cái"
        description={`${total} bút toán ghi kép trên toàn cửa hàng.`}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to="/tenant/finance">
              <ArrowLeft className="size-4" /> Về tài chính
            </Link>
          </Button>
        }
      />

      <Card>
        <CardContent className="p-4">
          {/* GET filter form — submitting drops `page`, so any filter change returns to page 1. */}
          <Form method="get" className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="entryType">Loại bút toán</Label>
              <NativeSelect id="entryType" name="entryType" defaultValue={filters.entryType}>
                <NativeSelectOption value="">Tất cả</NativeSelectOption>
                {(Object.keys(ENTRY_LABEL) as LedgerEntryTypeDto[]).map((t) => (
                  <NativeSelectOption key={t} value={t}>{ENTRY_LABEL[t]}</NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="from">Từ ngày</Label>
              <Input id="from" name="from" type="date" defaultValue={filters.from} className="w-auto" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="to">Đến ngày</Label>
              <Input id="to" name="to" type="date" defaultValue={filters.to} className="w-auto" />
            </div>
            <div className="flex gap-2">
              <Button type="submit" size="control" variant="outline">
                <Filter className="size-4" /> Lọc
              </Button>
              {hasFilters ? (
                <Button asChild size="control" variant="ghost">
                  <Link to="?" prefetch="intent">Xoá lọc</Link>
                </Button>
              ) : null}
            </div>
          </Form>
        </CardContent>
      </Card>

      {error ? (
        <Card>
          <CardContent className="p-4 text-sm text-destructive">{error}</CardContent>
        </Card>
      ) : null}

      <DataTable
        columns={columns}
        data={items}
        getRowKey={(e) => e.id}
        emptyMessage={hasFilters ? 'Không có bút toán khớp bộ lọc.' : 'Chưa có bút toán nào.'}
      />

      {totalPages > 1 ? (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Trang {page} / {totalPages}
          </span>
          <div className="flex gap-2">
            {page > 1 ? (
              <Button asChild variant="outline" size="sm">
                <Link to={pageHref(page - 1)} prefetch="intent">Trước</Link>
              </Button>
            ) : (
              <Button variant="outline" size="sm" disabled>Trước</Button>
            )}
            {page < totalPages ? (
              <Button asChild variant="outline" size="sm">
                <Link to={pageHref(page + 1)} prefetch="intent">Sau</Link>
              </Button>
            ) : (
              <Button variant="outline" size="sm" disabled>Sau</Button>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
