import { Link, useSearchParams } from 'react-router';
import {
  settlementStatusSchema,
  type BookingSettlementResponse,
  type Paginated,
  type SettlementStatusDto,
  type SettlementSummaryResponse,
  type PartnerResponse,
  uuidSchema,
} from '@booking/contracts';
import { ArrowLeft, CircleDollarSign, Clock3, HandCoins, Scale } from 'lucide-react';
import { Badge } from '@booking/ui/components/ui/badge';
import { Button } from '@booking/ui/components/ui/button';
import type { DataTableColumn } from '@booking/ui/components/data-table/data-table';
import type { Route } from './+types/settlements';
import { apiGet } from '~/lib/api.server';
import { requireTenant } from '~/features/tenant/server/tenant.server';
import { dashboardPaths } from '~/constants/paths';
import { SETTLEMENT_STATUS_LABEL } from '~/constants/finance';
import { DashboardDataTable } from '~/components/dashboard-data-table';
import { Money } from '~/components/money';
import { PageHeader } from '~/components/page-header';
import { StatCard } from '~/components/stat-card';
import { formatDateTime } from '~/lib/format';
import { readListParams } from '~/lib/pagination';
import type { FilterSpec } from '~/lib/list-filters';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Tiền đang giữ · Tài chính · Tenant · BookingOS' }];
}

function parseStatus(raw: string | null): SettlementStatusDto | '' {
  const parsed = settlementStatusSchema.safeParse(raw);
  return parsed.success ? parsed.data : '';
}

export async function loader({ request, url }: Route.LoaderArgs) {
  const { auth, can } = await requireTenant(request, 'tenant.finance.read');
  const list = readListParams(url.searchParams);
  const status = parseStatus(url.searchParams.get('status'));
  const partnerParsed = uuidSchema.safeParse(url.searchParams.get('partnerId'));
  const partnerId = partnerParsed.success ? partnerParsed.data : '';
  const [result, summary, partners] = await Promise.all([
    apiGet<Paginated<BookingSettlementResponse>>('/tenant/finance/settlements', auth, {
      query: list.toApiQuery({ status: status || undefined, partnerId: partnerId || undefined }),
    }),
    apiGet<SettlementSummaryResponse>('/tenant/finance/settlement-summary', auth, {
      query: { partnerId: partnerId || undefined },
    }),
    can('tenant.partners.read')
      ? apiGet<Paginated<PartnerResponse>>('/tenant/partners', auth, {
          query: { page: 1, pageSize: 100 },
        })
      : Promise.resolve(null),
  ]);
  return {
    status,
    partnerId,
    result: result.ok ? result.data : null,
    summary: summary.ok ? summary.data : null,
    partners: partners?.ok && partners.data ? partners.data.items : [],
    error: result.ok ? null : (result.error ?? 'Không tải được danh sách tiền đang giữ.'),
  };
}

const columns: DataTableColumn<BookingSettlementResponse>[] = [
  {
    header: 'Lượt đặt',
    cell: (row) => (
      <Link
        to={dashboardPaths.tenant.booking(row.bookingId)}
        className="font-mono text-xs font-medium text-primary hover:underline"
      >
        {row.bookingCode ?? row.bookingId.slice(0, 8)}
      </Link>
    ),
  },
  {
    header: 'Dịch vụ / khách hàng',
    className: 'hidden md:table-cell',
    headClassName: 'hidden md:table-cell',
    cell: (row) => (
      <div className="min-w-0">
        <p className="truncate font-medium">{row.listingTitle ?? '—'}</p>
        <p className="truncate text-xs text-muted-foreground">{row.customerName ?? '—'}</p>
      </div>
    ),
  },
  {
    header: 'Partner',
    className: 'hidden lg:table-cell',
    headClassName: 'hidden lg:table-cell',
    cell: (row) => row.partnerName ?? '—',
  },
  {
    header: 'Trạng thái',
    cell: (row) => (
      <Badge
        variant={
          row.status === 'disputed'
            ? 'destructive'
            : row.status === 'released'
              ? 'default'
              : 'secondary'
        }
      >
        {SETTLEMENT_STATUS_LABEL[row.status]}
      </Badge>
    ),
  },
  {
    header: 'Tenant giữ online',
    headClassName: 'text-right',
    className: 'text-right',
    cell: (row) => <Money value={row.remainingHeldAmount} className="font-medium" />,
  },
  {
    header: 'Partner thu tại chỗ',
    headClassName: 'text-right',
    className: 'text-right hidden md:table-cell',
    cell: (row) => <Money value={row.onsiteCollectedAmount} />,
  },
  {
    header: 'Tenant thực nhận',
    headClassName: 'text-right',
    className: 'text-right hidden lg:table-cell',
    cell: (row) => <Money value={row.tenantNetEarning} />,
  },
  {
    header: 'Còn phải chi',
    headClassName: 'text-right',
    className: 'text-right',
    cell: (row) => <Money value={row.remainingPayableAmount} className="font-medium" />,
  },
  {
    header: 'Hạn tranh chấp',
    headClassName: 'text-right',
    className: 'text-right whitespace-nowrap text-muted-foreground',
    cell: (row) => (row.disputeUntil ? formatDateTime(row.disputeUntil) : '—'),
  },
];

export default function TenantSettlements({ loaderData }: Route.ComponentProps) {
  const { result, error, status, partnerId, partners, summary } = loaderData;
  const [searchParams] = useSearchParams();
  const list = readListParams(searchParams);
  const items = result?.items ?? [];
  const total = result?.total ?? 0;
  const filterSpec: FilterSpec = [
    {
      kind: 'enum',
      key: 'status',
      label: 'Trạng thái',
      options: (Object.keys(SETTLEMENT_STATUS_LABEL) as SettlementStatusDto[]).map((value) => ({
        value,
        label: SETTLEMENT_STATUS_LABEL[value],
      })),
    },
    {
      kind: 'enum',
      key: 'partnerId',
      label: 'Partner',
      options: partners.map((partner) => ({ value: partner.id, label: partner.name })),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tiền đang giữ"
        description="Theo dõi tiền khách trả Tenant từ lúc cổng thanh toán xác nhận đến khi ghi nhận công nợ Partner."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to={dashboardPaths.tenant.finance}>
              <ArrowLeft className="size-4" /> Về tài chính
            </Link>
          </Button>
        }
      />

      {summary ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Đang giữ"
            value={<Money value={summary.heldAmount} />}
            hint={`${(summary.counts.held ?? 0) + (summary.counts.dispute_window ?? 0)} khoản`}
            icon={<Clock3 className="size-4" />}
          />
          <StatCard
            label="Đang tranh chấp"
            value={<Money value={summary.disputedAmount} />}
            hint={`${summary.counts.disputed ?? 0} khoản bị khóa`}
            icon={<Scale className="size-4" />}
          />
          <StatCard
            label="Chờ chuyển Partner"
            value={<Money value={summary.payoutPendingAmount} />}
            hint="Đã nằm trong lệnh chi"
            icon={<HandCoins className="size-4" />}
          />
          <StatCard
            label="Đã chuyển Partner"
            value={<Money value={summary.paidAmount} />}
            hint={
              <span>
                Còn lại <Money value={summary.remainingPayableAmount} />
              </span>
            }
            icon={<CircleDollarSign className="size-4" />}
          />
        </div>
      ) : null}

      <DashboardDataTable
        columns={columns}
        data={items}
        getRowKey={(row) => row.id}
        filters={filterSpec}
        filterValues={{ status, partnerId }}
        resetHref={dashboardPaths.tenant.settlements}
        pageSize={list.pageSize}
        error={error}
        emptyMessage="Chưa có khoản tiền giữ nào. Khoản tiền giữ sẽ xuất hiện khi có đơn đặt chỗ được thanh toán."
        pagination={{
          page: list.page,
          pageSize: list.pageSize,
          total,
          hrefFor: list.pageHref,
        }}
      />
    </div>
  );
}
