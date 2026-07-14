import type { AffiliateCommissionResponse, AffiliateCommissionStatusDto } from '@booking/contracts';
import { Badge } from '@booking/ui/components/ui/badge';
import { DataTable, type DataTableColumn } from '@booking/ui/components/data-table/data-table';
import type { Route } from './+types/commissions';
import { apiGet } from '~/lib/api.server';
import { requireAffiliate } from './affiliate.server';
import { formatDate, formatVnd } from '../tenant/format';

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

function CommissionBadge({ status }: { status: AffiliateCommissionStatusDto }) {
  const variant =
    status === 'paid' ? 'default' : status === 'confirmed' ? 'secondary' : status === 'pending' ? 'outline' : 'destructive';
  return <Badge variant={variant}>{STATUS_LABEL[status]}</Badge>;
}

export default function AffiliateCommissions({ loaderData }: Route.ComponentProps) {
  const { commissions } = loaderData;

  const columns: DataTableColumn<AffiliateCommissionResponse>[] = [
    { header: 'Mã đặt chỗ', cell: (c) => <span className="font-mono text-sm">{c.bookingCode ?? '—'}</span> },
    { header: 'Hoa hồng', cell: (c) => <span className="tabular-nums">{formatVnd(c.amount)}</span> },
    { header: 'Trạng thái', cell: (c) => <CommissionBadge status={c.status} /> },
    {
      header: 'Ngày',
      cell: (c) => <span className="text-sm text-muted-foreground">{formatDate(c.createdAt)}</span>,
      className: 'hidden sm:table-cell',
      headClassName: 'hidden sm:table-cell',
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
