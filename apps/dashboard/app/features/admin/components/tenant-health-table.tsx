import { Link } from 'react-router';
import { Webhook } from 'lucide-react';
import type { PlatformHealthTenant } from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import { DataTable, type DataTableColumn } from '@booking/ui/components/data-table/data-table';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@booking/ui/components/ui/empty';
import { InfoHint } from '@booking/ui/components/ui/info-hint';
import { formatDate, formatHours, formatNumber, formatVnd, formatVndCompact } from '~/lib/format';
import { VERTICAL_LABELS } from '~/constants/tenancy';
import { dashboardPaths } from '~/constants/paths';
import { SubscriptionStatusBadge, TenantStatusBadge } from '~/components/status-badge';
import { CountSignal } from './count-signal';

const columns: DataTableColumn<PlatformHealthTenant>[] = [
  {
    header: 'Tenant',
    cell: (t) => (
      <Link
        to={dashboardPaths.admin.tenant(t.tenantId)}
        className="group inline-flex flex-col gap-0.5"
      >
        <span className="font-medium underline-offset-4 group-hover:underline">{t.name}</span>
        <span className="text-xs text-muted-foreground">
          {t.slug} · {VERTICAL_LABELS[t.vertical] ?? t.vertical}
        </span>
      </Link>
    ),
  },
  { header: 'Trạng thái', cell: (t) => <TenantStatusBadge status={t.status} /> },
  {
    header: (
      <span className="inline-flex items-center gap-1">
        GMV
        <InfoHint>Tổng giá trị giao dịch của tenant.</InfoHint>
      </span>
    ),
    headClassName: 'text-right',
    className: 'text-right tabular-nums',
    cell: (t) => (
      <span title={formatVnd(t.gmv)} className="font-medium">
        {formatVndCompact(t.gmv)}
      </span>
    ),
  },
  {
    header: 'Listing đăng',
    headClassName: 'text-right',
    className: 'text-right tabular-nums',
    cell: (t) => formatNumber(t.publishedListings),
  },
  {
    header: 'Booking đầu tiên',
    headClassName: 'text-right',
    className: 'text-right tabular-nums',
    cell: (t) => <span className="text-muted-foreground">{formatHours(t.firstBookingHours)}</span>,
  },
  {
    header: 'Webhook lỗi',
    headClassName: 'text-right',
    className: 'text-right',
    cell: (t) => (
      <div className="flex justify-end">
        <CountSignal count={t.webhookFailures} />
      </div>
    ),
  },
  {
    header: 'Payout trễ',
    headClassName: 'text-right',
    className: 'text-right',
    cell: (t) => (
      <div className="flex justify-end">
        <CountSignal count={t.overduePayouts} />
      </div>
    ),
  },
  {
    header: 'Gói',
    cell: (t) =>
      t.subscription ? (
        <div className="flex flex-col gap-1">
          <SubscriptionStatusBadge status={t.subscription.status} />
          <span className="text-xs text-muted-foreground">
            đến {formatDate(t.subscription.expiresAt)}
          </span>
        </div>
      ) : (
        <span className="text-xs text-muted-foreground">Chưa gán</span>
      ),
  },
];

/** "Bảng sức khoẻ tenant" section: per-tenant GMV/listing/webhook/payout signals. */
export function TenantHealthTable({
  tenants,
  error,
}: {
  tenants: PlatformHealthTenant[];
  error: string | null;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <Webhook className="size-4 text-muted-foreground" />
            Bảng sức khoẻ tenant
          </h2>
          <p className="text-sm text-muted-foreground">
            Mỗi tenant: GMV, listing đã đăng, thời gian đến booking đầu, webhook lỗi, payout trễ.
          </p>
        </div>
      </div>
      {tenants.length === 0 && !error ? (
        <Empty className="rounded-xl border">
          <EmptyHeader>
            <EmptyTitle>Chưa có tenant</EmptyTitle>
            <EmptyDescription>
              Tạo tenant đầu tiên để bắt đầu theo dõi sức khoẻ nền tảng.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button asChild>
              <Link to={dashboardPaths.admin.tenantNew}>Tạo tenant</Link>
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <DataTable
          columns={columns}
          data={tenants}
          getRowKey={(t) => t.tenantId}
          emptyMessage="Chưa có tenant."
        />
      )}
    </section>
  );
}
