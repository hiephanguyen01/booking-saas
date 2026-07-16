import type { AffiliateCommissionResponse, AffiliateCommissionStatusDto } from '@booking/contracts';
import { DataTable, type DataTableColumn } from '@booking/ui/components/data-table/data-table';
import type { Route } from './+types/commissions';
import { apiGet } from '~/lib/api.server';
import { requireAffiliate } from './affiliate.server';
import { Money } from '~/components/money';
import { DateTimeValue } from '~/components/date-time-value';
import { EnumValue } from '~/components/enum-value';
import { BookingStatusBadge } from '~/components/status-badge';

export async function loader({ request }: Route.LoaderArgs) {
  const { auth, active } = await requireAffiliate(request);
  const res = active ? await apiGet<AffiliateCommissionResponse[]>('/affiliate/commissions', auth) : null;
  return { commissions: res?.ok ? (res.data ?? []) : [] };
}

const STATUS_LABEL: Record<AffiliateCommissionStatusDto, string> = {
  pending: 'Chờ xác nhận',
  confirmed: 'Đã xác nhận',
  paid: 'Đã trả',
  reversed: 'Đã huỷ',
  clawed_back: 'Đã thu hồi',
};

/** Commission-status tone via semantic tokens (no dedicated badge in the toolkit). */
function CommissionStatus({ status }: { status: AffiliateCommissionStatusDto }) {
  const tone =
    status === 'paid'
      ? 'text-emerald-600 dark:text-emerald-400'
      : status === 'confirmed'
        ? 'text-foreground'
        : status === 'pending'
          ? 'text-muted-foreground'
          : 'text-destructive';
  return (
    <span className={`text-sm font-medium ${tone}`}>
      <EnumValue map={STATUS_LABEL} value={status} />
    </span>
  );
}

export default function AffiliateCommissions({ loaderData }: Route.ComponentProps) {
  const { commissions } = loaderData;

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
    { header: 'Trạng thái', cell: (c) => <CommissionStatus status={c.status} /> },
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
    <DataTable
      columns={columns}
      data={commissions}
      getRowKey={(c) => c.id}
      emptyMessage="Chưa có hoa hồng nào."
    />
  );
}
