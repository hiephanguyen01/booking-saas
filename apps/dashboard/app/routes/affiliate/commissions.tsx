import { useSearchParams } from 'react-router';
import type { AffiliateCommissionResponse, Paginated } from '@booking/contracts';
import { DataTable, type DataTableColumn } from '@booking/ui/components/data-table/data-table';
import type { Route } from './+types/commissions';
import { apiGet } from '~/lib/api.server';
import { requireAffiliate } from '~/features/affiliate/server/affiliate.server';
import { BookingStatusBadge, CommissionStatusBadge } from '~/components/status-badge';
import { Money } from '~/components/money';
import { DateTimeValue } from '~/components/date-time-value';
import { readListParams } from '~/lib/pagination';
import { PaginationBar } from '~/components/pagination-bar';

export async function loader({ request, url }: Route.LoaderArgs) {
  const { auth, active } = await requireAffiliate(request);
  const { toApiQuery } = readListParams(url.searchParams);
  const res = active
    ? await apiGet<Paginated<AffiliateCommissionResponse>>('/affiliate/commissions', auth, {
        query: toApiQuery(),
      })
    : null;
  return { result: res?.ok ? res.data : null };
}

export default function AffiliateCommissions({ loaderData }: Route.ComponentProps) {
  const { result } = loaderData;
  const [searchParams] = useSearchParams();
  const { page, pageSize, pageHref } = readListParams(searchParams);
  const commissions = result?.items ?? [];
  const total = result?.total ?? 0;

  const columns: DataTableColumn<AffiliateCommissionResponse>[] = [
    {
      header: 'Mã đặt chỗ',
      cell: (c) => <span className="font-mono text-sm">{c.bookingCode ?? '—'}</span>,
    },
    {
      header: 'Listing',
      cell: (c) => <span className="text-sm text-muted-foreground">{c.listingTitle ?? '—'}</span>,
      className: 'hidden md:table-cell',
      headClassName: 'hidden md:table-cell',
    },
    {
      header: 'Giá trị đơn',
      cell: (c) => (c.bookingTotal ? <Money value={c.bookingTotal} /> : <span className="text-muted-foreground">—</span>),
      className: 'hidden lg:table-cell text-right',
      headClassName: 'hidden lg:table-cell text-right',
    },
    {
      header: 'Hoa hồng',
      cell: (c) => <Money value={c.amount} />,
      className: 'text-right',
      headClassName: 'text-right',
    },
    {
      header: 'Đơn',
      cell: (c) =>
        c.bookingStatus ? (
          <BookingStatusBadge status={c.bookingStatus} />
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
      className: 'hidden sm:table-cell',
      headClassName: 'hidden sm:table-cell',
    },
    { header: 'Trạng thái', cell: (c) => <CommissionStatusBadge status={c.status} /> },
    {
      header: 'Ngày tạo',
      cell: (c) => <DateTimeValue iso={c.createdAt} className="text-sm text-muted-foreground" />,
      className: 'hidden sm:table-cell text-right',
      headClassName: 'hidden sm:table-cell text-right',
    },
    {
      header: 'Ngày trả',
      cell: (c) =>
        c.paidAt ? (
          <DateTimeValue iso={c.paidAt} className="text-sm text-muted-foreground" />
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
      className: 'hidden lg:table-cell text-right',
      headClassName: 'hidden lg:table-cell text-right',
    },
  ];

  return (
    <div className="space-y-4">
      <DataTable
        columns={columns}
        data={commissions}
        getRowKey={(c) => c.id}
        emptyMessage="Chưa có hoa hồng nào."
      />

      <PaginationBar page={page} pageSize={pageSize} total={total} hrefFor={pageHref} />
    </div>
  );
}
