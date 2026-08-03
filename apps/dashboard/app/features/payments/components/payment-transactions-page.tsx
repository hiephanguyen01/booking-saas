import type { Paginated, PaymentHistoryItem } from '@booking/contracts';
import type { DataTableColumn } from '@booking/ui/components/data-table/data-table';
import { Badge } from '@booking/ui/components/ui/badge';
import { Link, useSearchParams } from 'react-router';
import type { ReactNode } from 'react';
import { DashboardDataTable } from '~/components/dashboard-data-table';
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
import { hasActiveFilters } from '~/lib/list-filters';
import { PAYMENT_FILTER_SPEC } from '~/features/payments/lib/payment-filters';

function statusClass(status: PaymentHistoryItem['status']): string {
  if (status === 'succeeded') return 'border-success/30 bg-success/10 text-success';
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
  filters: Record<string, string>;
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
  const hasFilters = hasActiveFilters(filters);
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

      <DashboardDataTable
        columns={columns}
        data={items}
        getRowKey={(item) => item.id}
        filters={PAYMENT_FILTER_SPEC}
        filterValues={filters}
        resetHref={resetHref}
        pageSize={pageSize}
        error={error}
        emptyMessage={
          hasFilters
            ? 'Không có giao dịch khớp bộ lọc.'
            : 'Chưa có giao dịch nào. Giao dịch sẽ xuất hiện sau lượt thanh toán đầu tiên.'
        }
        pagination={{ page, pageSize, total, hrefFor: pageHref }}
      />
    </div>
  );
}
