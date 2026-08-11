import type { LedgerEntryResponse, PayoutResponse } from '@booking/contracts';
import type { DataTableColumn } from '@booking/ui/components/data-table/data-table';
import { cn } from '@booking/ui/lib/utils';
import { CopyableCode } from '~/components/copyable-code';
import { Money, amountToneClass } from '~/components/money';
import { PayoutStatusBadge } from '~/components/status-badge';
import { LEDGER_ENTRY_LABEL } from '~/constants/finance';
import { formatDate } from '~/lib/format';

export const partnerJournalColumns: DataTableColumn<LedgerEntryResponse>[] = [
  {
    header: 'Ngày',
    cell: (entry) => (
      <span className="whitespace-nowrap text-sm text-muted-foreground">
        {formatDate(entry.createdAt)}
      </span>
    ),
  },
  {
    header: 'Hạng mục',
    cell: (entry) => (
      <div className="min-w-0">
        <p className="font-medium">{LEDGER_ENTRY_LABEL[entry.entryType] ?? entry.entryType}</p>
        {entry.memo ? <p className="truncate text-xs text-muted-foreground">{entry.memo}</p> : null}
      </div>
    ),
  },
  {
    header: 'Số tiền',
    headClassName: 'text-right',
    className: 'text-right',
    cell: (entry) => {
      const isCredit = BigInt(entry.credit || '0') > 0n;
      const amount = isCredit ? entry.credit : entry.debit;
      return (
        <span className="tabular-nums font-medium">
          {isCredit ? '+' : '-'}
          <Money
            value={amount}
            className={cn(
              'font-medium',
              isCredit ? amountToneClass('positive') : 'text-foreground',
            )}
          />
        </span>
      );
    },
  },
];

export const partnerPayoutColumns: DataTableColumn<PayoutResponse>[] = [
  {
    header: 'Ngày',
    cell: (payout) => (
      <span className="whitespace-nowrap text-sm text-muted-foreground">
        {formatDate(payout.createdAt)}
      </span>
    ),
  },
  {
    header: 'Kỳ chi trả',
    cell: (payout) =>
      payout.periodFrom || payout.periodTo ? (
        <span className="whitespace-nowrap text-sm text-muted-foreground tabular-nums">
          {formatDate(payout.periodFrom)} – {formatDate(payout.periodTo)}
        </span>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    header: 'Trạng thái',
    cell: (payout) => (
      <div className="space-y-1">
        <PayoutStatusBadge status={payout.status} />
        {payout.status === 'failed' && payout.failureReason ? (
          <p className="max-w-xs text-xs text-destructive">{payout.failureReason}</p>
        ) : null}
      </div>
    ),
  },
  {
    header: 'Tham chiếu',
    cell: (payout) =>
      payout.reference ? (
        <CopyableCode value={payout.reference} label="mã chuyển khoản" />
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    header: 'Số tiền',
    headClassName: 'text-right',
    className: 'text-right',
    cell: (payout) => <Money value={payout.amount} className="font-medium" />,
  },
];
