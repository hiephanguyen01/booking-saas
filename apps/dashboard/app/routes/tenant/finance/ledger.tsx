import { Link, useSearchParams } from 'react-router';
import {
  type LedgerEntryResponse,
  type LedgerEntryTypeDto,
  type Paginated,
} from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import { Badge } from '@booking/ui/components/ui/badge';
import type { DataTableColumn } from '@booking/ui/components/data-table/data-table';
import { InfoHint } from '@booking/ui/components/ui/info-hint';
import { ArrowLeft } from 'lucide-react';
import type { Route } from './+types/ledger';
import { apiGet } from '~/lib/api.server';
import { requireTenant } from '~/features/tenant/server/tenant.server';
import { LEDGER_ENTRY_LABEL, LEDGER_OWNER_LABEL } from '~/constants/finance';
import { formatVnd, formatDateTime } from '~/lib/format';
import { PageHeader } from '~/components/page-header';
import { DashboardDataTable } from '~/components/dashboard-data-table';
import { amountToneClass } from '~/components/money';
import { dashboardPaths } from '~/constants/paths';
import { readListParams } from '~/lib/pagination';
import { readListFilters, hasActiveFilters, type FilterSpec } from '~/lib/list-filters';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Sổ cái · Tài chính · Tenant · BookingOS' }];
}

const LEDGER_FILTER_SPEC: FilterSpec = [
  {
    kind: 'enum',
    key: 'entryType',
    label: 'Loại bút toán',
    options: (Object.keys(LEDGER_ENTRY_LABEL) as LedgerEntryTypeDto[]).map((t) => ({
      value: t,
      label: LEDGER_ENTRY_LABEL[t],
    })),
  },
  { kind: 'date-range', fromKey: 'from', toKey: 'to', label: 'Ngày' },
];

export async function loader({ request, url }: Route.LoaderArgs) {
  const { auth } = await requireTenant(request, 'tenant.finance.read');
  const { toApiQuery } = readListParams(url.searchParams);
  const { filters, apiFilters } = readListFilters(url.searchParams, LEDGER_FILTER_SPEC);

  const res = await apiGet<Paginated<LedgerEntryResponse>>('/tenant/finance/ledger', auth, {
    query: toApiQuery(apiFilters),
  });

  return {
    filters,
    result: res.ok ? res.data : null,
    error: res.ok ? null : (res.error ?? 'Không tải được sổ cái.'),
  };
}

/** First non-null reference on a ledger line, labelled for the table; `fullId` carries the
 * untruncated id for a `title=` tooltip since no friendly `code` exists on this payload. */
function refLabel(e: LedgerEntryResponse): { text: string; fullId?: string } {
  if (e.bookingId) return { text: `Đơn ${e.bookingId.slice(0, 8)}`, fullId: e.bookingId };
  if (e.paymentId) return { text: `TT ${e.paymentId.slice(0, 8)}`, fullId: e.paymentId };
  if (e.payoutId) return { text: `Chi ${e.payoutId.slice(0, 8)}`, fullId: e.payoutId };
  return { text: '—' };
}

const columns: DataTableColumn<LedgerEntryResponse>[] = [
  {
    header: 'Bút toán',
    cell: (e) => (
      <span className="font-mono text-xs text-muted-foreground" title={e.journalId}>
        {e.journalId.slice(0, 8)}
      </span>
    ),
  },
  {
    header: 'Chủ tài khoản',
    // Prefer the server-resolved display name; null is expected for the platform owner
    // (and for a deleted owner) — the ownerType badge already labels the row in that case.
    cell: (e) => (
      <div className="flex flex-col gap-0.5">
        <Badge variant="secondary" className="w-fit">
          {LEDGER_OWNER_LABEL[e.ownerType] ?? 'Không xác định'}
        </Badge>
        {e.ownerName ? <span className="text-xs text-muted-foreground">{e.ownerName}</span> : null}
      </div>
    ),
  },
  {
    header: 'Loại bút toán',
    cell: (e) => (
      <span className="text-sm">{LEDGER_ENTRY_LABEL[e.entryType] ?? 'Không xác định'}</span>
    ),
  },
  {
    header: (
      <span className="inline-flex items-center gap-1">
        Nợ
        <InfoHint>Ghi sổ kép: mỗi bút toán luôn có Nợ và Có cân bằng nhau.</InfoHint>
      </span>
    ),
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
    cell: (e) => {
      const { text, fullId } = refLabel(e);
      return (
        <span className="font-mono text-xs text-muted-foreground" title={fullId}>
          {text}
        </span>
      );
    },
  },
  {
    header: 'Thời gian',
    headClassName: 'text-right',
    className: 'text-right tabular-nums text-muted-foreground',
    cell: (e) => formatDateTime(e.createdAt),
  },
];

export default function TenantLedger({ loaderData }: Route.ComponentProps) {
  const { result, error, filters } = loaderData;
  const [searchParams] = useSearchParams();
  const { page, pageSize, pageHref } = readListParams(searchParams);
  const items = result?.items ?? [];
  const total = result?.total ?? 0;
  const hasFilters = hasActiveFilters(filters);

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

      <DashboardDataTable
        columns={columns}
        data={items}
        getRowKey={(entry) => entry.id}
        filters={LEDGER_FILTER_SPEC}
        filterValues={filters}
        resetHref={dashboardPaths.tenant.ledger}
        pageSize={pageSize}
        error={error}
        emptyMessage={
          hasFilters
            ? 'Không có bút toán khớp bộ lọc.'
            : 'Chưa có bút toán nào. Bút toán sẽ xuất hiện sau giao dịch đầu tiên trên cửa hàng.'
        }
        pagination={{ page, pageSize, total, hrefFor: pageHref }}
      />
    </div>
  );
}
