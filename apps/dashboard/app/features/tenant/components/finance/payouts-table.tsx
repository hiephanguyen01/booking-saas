import type { PayoutResponse } from '@booking/contracts';
import { DataTable, type DataTableColumn } from '@booking/ui/components/data-table/data-table';
import { Money } from '~/components/money';
import { PayoutStatusBadge } from '~/components/status-badge';
import { PAYEE_TYPE_LABEL } from '~/constants/finance';
import { MarkFailedDialog, MarkPaidDialog } from './payout-action-dialogs';

/** The payout runs table, with settle/fail actions on in-flight rows. */
export function PayoutsTable({
  payouts,
  partnerNames,
  readOnly,
}: {
  payouts: PayoutResponse[];
  partnerNames: Record<string, string>;
  readOnly: boolean;
}) {
  const payeeName = (p: PayoutResponse): string => partnerNames[p.payeeId] ?? p.payeeId.slice(0, 8);

  const columns: DataTableColumn<PayoutResponse>[] = [
    { header: 'Người nhận', cell: (p) => <span className="text-sm">{payeeName(p)}</span> },
    {
      header: 'Loại',
      cell: (p) => (
        <span className="text-sm text-muted-foreground">{PAYEE_TYPE_LABEL[p.payeeType]}</span>
      ),
    },
    { header: 'Số tiền', cell: (p) => <Money value={p.amount} className="font-medium" /> },
    { header: 'Trạng thái', cell: (p) => <PayoutStatusBadge status={p.status} /> },
    {
      header: '',
      headClassName: 'text-right',
      className: 'text-right',
      cell: (p) => {
        if (p.status === 'pending' || p.status === 'processing') {
          return (
            <div className="flex flex-wrap justify-end gap-1.5">
              <MarkPaidDialog payout={p} name={payeeName(p)} readOnly={readOnly} />
              <MarkFailedDialog payout={p} name={payeeName(p)} readOnly={readOnly} />
            </div>
          );
        }
        // A failed payout carries its explanation only in `failureReason` — render it, or the
        // row reads as an unexplained failure. `PayoutStatusBadge` already flags the status.
        if (p.status === 'failed') {
          return (
            <span className="text-xs text-destructive">
              {p.failureReason ?? 'Thất bại — không rõ lý do'}
            </span>
          );
        }
        return p.reference ? (
          <span className="text-xs text-muted-foreground">Ref: {p.reference}</span>
        ) : null;
      },
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={payouts}
      getRowKey={(p) => p.id}
      emptyMessage="Chưa có lệnh chi nào. Lệnh chi sẽ xuất hiện khi có khoản tiền đủ điều kiện chi trả."
    />
  );
}
