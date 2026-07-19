import type { Paginated, PaymentHistoryItem } from '@booking/contracts';
import { DataTable, type DataTableColumn } from '@booking/ui/components/data-table/data-table';
import { Badge } from '@booking/ui/components/ui/badge';
import { Button } from '@booking/ui/components/ui/button';
import { Input } from '@booking/ui/components/ui/input';
import { Label } from '@booking/ui/components/ui/label';
import { NativeSelect } from '@booking/ui/components/ui/native-select';
import { Search } from 'lucide-react';
import { Form, Link, useSearchParams } from 'react-router';
import type { ReactNode } from 'react';
import { ErrorBanner } from '~/components/action-feedback';
import { PaginationBar } from '~/components/pagination-bar';
import { PageHeader } from '~/components/page-header';
import {
  PAYMENT_GATEWAY_LABEL,
  PAYMENT_KIND_LABEL,
  PAYMENT_METHOD_LABEL,
  PAYMENT_STATUS_LABEL,
} from '~/constants/payments';
import { dashboardPaths } from '~/constants/paths';
import { formatDateTime, formatVnd } from '~/lib/format';
import { readListParams } from '~/lib/pagination';
import type { PaymentHistoryFilters } from '../lib/payment-history';

function statusClass(status: PaymentHistoryItem['status']): string {
  if (status === 'succeeded') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700';
  if (status === 'failed') return 'border-destructive/30 bg-destructive/10 text-destructive';
  if (status === 'expired') return 'text-muted-foreground';
  return 'border-warning/30 bg-warning/10 text-warning-foreground';
}

export function PaymentTransactionsPage({
  area,
  filters,
  result,
  error,
  supplementary,
}: {
  area: 'platform' | 'tenant';
  filters: PaymentHistoryFilters;
  result: Paginated<PaymentHistoryItem> | null;
  error: string | null;
  supplementary?: ReactNode;
}) {
  const [searchParams] = useSearchParams();
  const { page, pageSize, pageHref } = readListParams(searchParams);
  const items = result?.items ?? [];
  const total = result?.total ?? 0;
  const resetHref =
    area === 'platform' ? dashboardPaths.admin.transactions : dashboardPaths.tenant.transactions;
  const hasFilters = Boolean(
    filters.search || filters.status || filters.kind || filters.from || filters.to,
  );
  const columns: DataTableColumn<PaymentHistoryItem>[] = [
    ...(area === 'platform'
      ? [{ header: 'Tenant', cell: (item: PaymentHistoryItem) => item.tenantName ?? '—' }]
      : []),
    {
      header: 'Đặt chỗ',
      cell: (item) =>
        area === 'tenant' ? (
          <Link
            to={dashboardPaths.tenant.booking(item.bookingId)}
            className="font-medium underline-offset-4 hover:underline"
          >
            {item.bookingCode}
          </Link>
        ) : (
          <span className="font-medium">{item.bookingCode}</span>
        ),
    },
    {
      header: 'Giao dịch',
      cell: (item) => (
        <div className="flex flex-col gap-0.5">
          <span className="text-sm">{PAYMENT_KIND_LABEL[item.kind]}</span>
          <span className="font-mono text-xs text-muted-foreground">
            {item.gatewayOrderRef ?? item.gatewayTxnId ?? item.id.slice(0, 8)}
          </span>
        </div>
      ),
    },
    {
      header: 'Phương thức',
      cell: (item) => (
        <div className="flex flex-col gap-0.5">
          <span className="font-medium">{PAYMENT_GATEWAY_LABEL[item.gateway]}</span>
          <span className="text-xs text-muted-foreground">
            {item.paymentMethod
              ? (PAYMENT_METHOD_LABEL[item.paymentMethod] ?? item.paymentMethod)
              : '—'}
          </span>
        </div>
      ),
    },
    {
      header: 'Số tiền',
      headClassName: 'text-right',
      className: 'text-right font-medium tabular-nums',
      cell: (item) => formatVnd(item.amount),
    },
    {
      header: 'Trạng thái',
      cell: (item) => (
        <Badge variant="outline" className={statusClass(item.status)}>
          {PAYMENT_STATUS_LABEL[item.status]}
        </Badge>
      ),
    },
    {
      header: 'Thời gian',
      headClassName: 'text-right',
      className: 'text-right text-muted-foreground',
      cell: (item) => formatDateTime(item.paidAt ?? item.createdAt),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Lịch sử giao dịch"
        description={`${total} giao dịch thanh toán${area === 'platform' ? ' trên toàn nền tảng' : ''}.`}
      />

      {supplementary}

      <Form method="get" className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="pageSize" value={pageSize} />
        <div className="min-w-56 flex-1 space-y-1.5">
          <Label htmlFor="search">Tìm kiếm</Label>
          <Input
            id="search"
            name="search"
            type="search"
            defaultValue={filters.search}
            placeholder="Mã đặt chỗ, hóa đơn hoặc giao dịch…"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="status">Trạng thái</Label>
          <NativeSelect id="status" name="status" defaultValue={filters.status}>
            <option value="">Tất cả</option>
            {Object.entries(PAYMENT_STATUS_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="kind">Loại</Label>
          <NativeSelect id="kind" name="kind" defaultValue={filters.kind}>
            <option value="">Tất cả</option>
            {Object.entries(PAYMENT_KIND_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
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
        <Button type="submit" variant="secondary">
          <Search className="size-4" /> Lọc
        </Button>
        {hasFilters ? (
          <Button asChild variant="ghost">
            <Link to={resetHref}>Xoá lọc</Link>
          </Button>
        ) : null}
      </Form>

      <ErrorBanner error={error} />
      <DataTable
        columns={columns}
        data={items}
        getRowKey={(item) => item.id}
        emptyMessage={hasFilters ? 'Không có giao dịch khớp bộ lọc.' : 'Chưa có giao dịch nào.'}
      />
      <PaginationBar page={page} pageSize={pageSize} total={total} hrefFor={pageHref} />
    </div>
  );
}
