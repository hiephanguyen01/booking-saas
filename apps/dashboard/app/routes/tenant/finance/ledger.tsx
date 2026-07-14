import { Link } from 'react-router';
import {
  type LedgerEntryResponse,
  type LedgerEntryTypeDto,
  type LedgerOwnerTypeDto,
  type Paginated,
} from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import { Card, CardContent } from '@booking/ui/components/ui/card';
import { Badge } from '@booking/ui/components/ui/badge';
import { DataTable, type DataTableColumn } from '@booking/ui/components/data-table/data-table';
import { ArrowLeft } from 'lucide-react';
import type { Route } from './+types/ledger';
import { apiGet } from '~/lib/api.server';
import { requireTenant } from '../tenant.server';
import { formatVnd, formatDateTime } from '../format';
import { PageHeader } from '../components/page';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Sổ cái · Tài chính · Tenant · Bookify' }];
}

const PAGE_SIZE = 25;

export async function loader({ request }: Route.LoaderArgs) {
  const { auth } = await requireTenant(request, 'tenant.finance.read');
  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get('page') ?? '1') || 1);

  const res = await apiGet<Paginated<LedgerEntryResponse>>(
    `/tenant/finance/ledger?page=${page}&pageSize=${PAGE_SIZE}`,
    auth,
  );

  return {
    page,
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
    cell: (e) => (
      <div className="flex flex-col gap-0.5">
        <Badge variant="secondary" className="w-fit">{OWNER_LABEL[e.ownerType] ?? e.ownerType}</Badge>
        {e.ownerId ? <span className="font-mono text-[11px] text-muted-foreground">{e.ownerId.slice(0, 8)}</span> : null}
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
        <span className="font-medium text-rose-600 dark:text-rose-400">{formatVnd(e.debit)}</span>
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
        <span className="font-medium text-emerald-600 dark:text-emerald-400">{formatVnd(e.credit)}</span>
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
  const { result, error, page } = loaderData;
  const items = result?.items ?? [];
  const total = result?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

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

      {error ? (
        <Card>
          <CardContent className="p-4 text-sm text-rose-600 dark:text-rose-400">{error}</CardContent>
        </Card>
      ) : null}

      <DataTable
        columns={columns}
        data={items}
        getRowKey={(e) => e.id}
        emptyMessage="Chưa có bút toán nào."
      />

      {totalPages > 1 ? (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Trang {page} / {totalPages}
          </span>
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm" disabled={page <= 1} aria-disabled={page <= 1}>
              <Link to={`?page=${page - 1}`} prefetch="intent">Trước</Link>
            </Button>
            <Button asChild variant="outline" size="sm" disabled={page >= totalPages} aria-disabled={page >= totalPages}>
              <Link to={`?page=${page + 1}`} prefetch="intent">Sau</Link>
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
