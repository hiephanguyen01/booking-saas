import type { AffiliateDetailResponse } from '@booking/contracts';
import { Card, CardContent } from '@booking/ui/components/ui/card';
import { DataTable, type DataTableColumn } from '@booking/ui/components/data-table/data-table';
import { DetailSection } from '@booking/ui/components/detail/detail-section';
import { Money } from '~/components/money';
import { EntityRef } from '~/components/entity-ref';
import { DateTimeValue } from '~/components/date-time-value';
import { CommissionStatusBadge } from '~/components/status-badge';

type AffiliateCommission = AffiliateDetailResponse['commissions'][number];

const commissionColumns: DataTableColumn<AffiliateCommission>[] = [
  {
    header: 'Mã đặt chỗ',
    cell: (c) => (
      <EntityRef
        to={c.bookingId ? `/tenant/bookings/${c.bookingId}` : null}
        name={<span className="font-mono text-sm">{c.bookingCode ?? '—'}</span>}
      />
    ),
  },
  {
    header: 'Listing',
    cell: (c) => <span className="text-sm text-muted-foreground">{c.listingTitle ?? '—'}</span>,
    className: 'hidden md:table-cell',
    headClassName: 'hidden md:table-cell',
  },
  { header: 'Hoa hồng', cell: (c) => <Money value={c.amount} /> },
  {
    header: 'Giá trị đơn',
    cell: (c) =>
      c.bookingTotal ? (
        <Money value={c.bookingTotal} />
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
    className: 'hidden lg:table-cell',
    headClassName: 'hidden lg:table-cell',
  },
  { header: 'Trạng thái', cell: (c) => <CommissionStatusBadge status={c.status} /> },
  {
    header: 'Ngày tạo',
    cell: (c) => <DateTimeValue iso={c.createdAt} className="text-sm text-muted-foreground" />,
    className: 'hidden sm:table-cell',
    headClassName: 'hidden sm:table-cell',
  },
  {
    header: 'Ngày trả',
    cell: (c) =>
      c.paidAt ? (
        <DateTimeValue iso={c.paidAt} className="text-sm text-muted-foreground" />
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
    className: 'hidden lg:table-cell',
    headClassName: 'hidden lg:table-cell',
  },
];

/** Per-booking commission rows for the affiliate. */
export function AffiliateCommissionsTable({
  commissions,
}: {
  commissions: AffiliateDetailResponse['commissions'];
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <DetailSection
          title={`Hoa hồng theo đơn (${commissions.length})`}
          emptyMessage="Chưa có hoa hồng nào."
        >
          {commissions.length > 0 ? (
            <DataTable columns={commissionColumns} data={commissions} getRowKey={(c) => c.id} />
          ) : null}
        </DetailSection>
      </CardContent>
    </Card>
  );
}
