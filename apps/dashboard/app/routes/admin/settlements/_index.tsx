import { useSearchParams } from 'react-router';
import {
  type BookingSettlementResponse,
  type Paginated,
  type SettlementStatusDto,
} from '@booking/contracts';
import { Badge } from '@booking/ui/components/ui/badge';
import { DataTable, type DataTableColumn } from '@booking/ui/components/data-table/data-table';
import type { Route } from './+types/_index';
import { apiGet } from '~/lib/api.server';
import { requirePlatform } from '~/features/admin/server/admin.server';
import { SETTLEMENT_STATUS_LABEL } from '~/constants/finance';
import { ErrorBanner } from '~/components/action-feedback';
import { Money } from '~/components/money';
import { PageHeader } from '~/components/page-header';
import { PaginationBar } from '~/components/pagination-bar';
import { ListToolbar } from '~/components/list-toolbar';
import { dashboardPaths } from '~/constants/paths';
import { readListParams } from '~/lib/pagination';
import { readListFilters, type FilterSpec } from '~/lib/list-filters';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Đối soát giữ tiền · BookingOS Admin' }];
}

const SETTLEMENT_FILTER_SPEC: FilterSpec = [
  {
    kind: 'enum',
    key: 'status',
    label: 'Trạng thái',
    options: (Object.keys(SETTLEMENT_STATUS_LABEL) as SettlementStatusDto[]).map((value) => ({
      value,
      label: SETTLEMENT_STATUS_LABEL[value],
    })),
  },
];

export async function loader({ request, url }: Route.LoaderArgs) {
  const { auth } = await requirePlatform(request, 'platform.finance.read');
  const list = readListParams(url.searchParams);
  const { filters, apiFilters } = readListFilters(url.searchParams, SETTLEMENT_FILTER_SPEC);
  const result = await apiGet<Paginated<BookingSettlementResponse>>(
    '/platform/finance/settlements',
    auth,
    { query: list.toApiQuery(apiFilters) },
  );
  return {
    filters,
    result: result.ok ? result.data : null,
    error: result.ok ? null : (result.error ?? 'Không tải được sổ đối soát.'),
  };
}

const columns: DataTableColumn<BookingSettlementResponse>[] = [
  {
    header: 'Tenant / booking',
    cell: (row) => (
      <div>
        <p className="font-medium">{row.tenantName ?? row.tenantId.slice(0, 8)}</p>
        <p className="font-mono text-xs text-muted-foreground">{row.bookingCode ?? row.bookingId.slice(0, 8)}</p>
      </div>
    ),
  },
  {
    header: 'Dịch vụ / Partner',
    cell: (row) => (
      <div>
        <p>{row.listingTitle ?? '—'}</p>
        <p className="text-xs text-muted-foreground">{row.partnerName ?? '—'}</p>
      </div>
    ),
  },
  {
    header: 'Trạng thái',
    cell: (row) => (
      <Badge variant={row.status === 'disputed' ? 'destructive' : 'secondary'}>
        {SETTLEMENT_STATUS_LABEL[row.status]}
      </Badge>
    ),
  },
  {
    header: 'Tenant giữ',
    headClassName: 'text-right',
    className: 'text-right',
    cell: (row) => <Money value={row.remainingHeldAmount} />,
  },
  {
    header: 'Partner payable',
    headClassName: 'text-right',
    className: 'text-right',
    cell: (row) => <Money value={row.partnerPayable} />,
  },
  {
    header: 'Đã chi / còn lại',
    headClassName: 'text-right',
    className: 'text-right',
    cell: (row) => (
      <div>
        <Money value={row.paidAmount} />
        <p className="text-xs text-muted-foreground">còn <Money value={row.remainingPayableAmount} /></p>
      </div>
    ),
  },
];

export default function PlatformSettlements({ loaderData }: Route.ComponentProps) {
  const { result, error, filters } = loaderData;
  const [searchParams] = useSearchParams();
  const list = readListParams(searchParams);
  return (
    <div className="space-y-6">
      <PageHeader title="Đối soát giữ tiền" description="Theo dõi tiền đang giữ, tranh chấp, hoàn tiền và chi trả của mọi Tenant." />
      <ListToolbar
        spec={SETTLEMENT_FILTER_SPEC}
        filters={filters}
        resetHref={dashboardPaths.admin.settlements}
        pageSize={list.pageSize}
      />
      <ErrorBanner error={error} />
      <DataTable columns={columns} data={result?.items ?? []} getRowKey={(row) => row.id} emptyMessage="Chưa có khoản tiền giữ nào." />
      <PaginationBar page={list.page} pageSize={list.pageSize} total={result?.total ?? 0} hrefFor={list.pageHref} />
    </div>
  );
}
