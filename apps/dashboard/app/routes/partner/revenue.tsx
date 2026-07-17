import { useMemo } from 'react';
import { Banknote, TrendingUp, Wallet } from 'lucide-react';
import type {
  LedgerEntryResponse,
  PartnerFinanceResponse,
  PayoutResponse,
} from '@booking/contracts';
import { cn } from '@booking/ui/lib/utils';
import { DataTable, type DataTableColumn } from '@booking/ui/components/data-table/data-table';
import type { Route } from './+types/revenue';
import { apiGet } from '~/lib/api.server';
import { requirePartner } from '~/features/partner/server/partner.server';
import { LEDGER_ENTRY_LABEL } from '~/constants/finance';
import { ErrorBanner } from '~/components/action-feedback';
import { PageHeader } from '~/components/page-header';
import { StatCard } from '~/components/stat-card';
import { Money, amountToneClass } from '~/components/money';
import { CopyableCode } from '~/components/copyable-code';
import { PayoutStatusBadge } from '~/components/status-badge';
import { formatDate } from '~/lib/format';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Doanh thu · Đối tác · Bookify' }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { auth } = await requirePartner(request, 'partner.finance.read');
  // The payout runs come from their own endpoint so pending/failed runs are
  // visible (the ledger only records settled payouts). Each fetch can fail
  // independently — a payout-feed error must not blank out the ledger.
  const [financeRes, payoutsRes] = await Promise.all([
    apiGet<PartnerFinanceResponse>('/partner/finance', auth),
    apiGet<PayoutResponse[]>('/partner/finance/payouts', auth),
  ]);
  const finance: PartnerFinanceResponse =
    financeRes.ok && financeRes.data ? financeRes.data : { balance: '0', entries: [] };
  const payouts: PayoutResponse[] = payoutsRes.ok && payoutsRes.data ? payoutsRes.data : [];
  return {
    finance,
    payouts,
    financeError: financeRes.ok ? null : (financeRes.error ?? 'Không tải được dữ liệu tài chính.'),
    payoutsError: payoutsRes.ok ? null : (payoutsRes.error ?? 'Không tải được lịch sử chi trả.'),
  };
}

function sumBig(values: string[]): string {
  return values.reduce((acc, v) => acc + BigInt(v || '0'), 0n).toString();
}

export default function PartnerRevenuePage({ loaderData }: Route.ComponentProps) {
  const { finance, payouts, financeError, payoutsError } = loaderData;
  const entries = finance.entries;

  const totalCredit = useMemo(() => sumBig(entries.map((e) => e.credit)), [entries]);
  const paidPayouts = useMemo(() => payouts.filter((p) => p.status === 'paid'), [payouts]);
  const totalPaidOut = useMemo(() => sumBig(paidPayouts.map((p) => p.amount)), [paidPayouts]);

  const journalColumns: DataTableColumn<LedgerEntryResponse>[] = [
    {
      header: 'Ngày',
      cell: (e) => (
        <span className="whitespace-nowrap text-sm text-muted-foreground">
          {formatDate(e.createdAt)}
        </span>
      ),
    },
    {
      header: 'Hạng mục',
      cell: (e) => (
        <div className="min-w-0">
          <p className="font-medium">{LEDGER_ENTRY_LABEL[e.entryType] ?? e.entryType}</p>
          {e.memo ? <p className="truncate text-xs text-muted-foreground">{e.memo}</p> : null}
        </div>
      ),
    },
    {
      header: 'Số tiền',
      headClassName: 'text-right',
      className: 'text-right',
      cell: (e) => {
        const isCredit = BigInt(e.credit || '0') > 0n;
        const amount = isCredit ? e.credit : e.debit;
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

  const payoutColumns: DataTableColumn<PayoutResponse>[] = [
    {
      header: 'Ngày',
      cell: (p) => (
        <span className="whitespace-nowrap text-sm text-muted-foreground">
          {formatDate(p.createdAt)}
        </span>
      ),
    },
    {
      header: 'Kỳ chi trả',
      cell: (p) =>
        p.periodFrom || p.periodTo ? (
          <span className="whitespace-nowrap text-sm text-muted-foreground tabular-nums">
            {formatDate(p.periodFrom)} – {formatDate(p.periodTo)}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      header: 'Trạng thái',
      cell: (p) => (
        <div className="space-y-1">
          <PayoutStatusBadge status={p.status} />
          {p.status === 'failed' && p.failureReason ? (
            <p className="max-w-xs text-xs text-destructive">{p.failureReason}</p>
          ) : null}
        </div>
      ),
    },
    {
      header: 'Tham chiếu',
      cell: (p) =>
        p.reference ? (
          <CopyableCode value={p.reference} label="mã chuyển khoản" />
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      header: 'Số tiền',
      headClassName: 'text-right',
      className: 'text-right',
      cell: (p) => <Money value={p.amount} className="font-medium" />,
    },
  ];

  const balanceNegative = finance.balance.startsWith('-');

  return (
    <div className="space-y-5">
      <PageHeader title="Doanh thu" description="Số dư, sổ cái và lịch sử chi trả của bạn." />

      <ErrorBanner error={financeError} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="Số dư hiện tại"
          value={<Money value={finance.balance} />}
          hint="Số tiền nền tảng còn phải trả bạn"
          icon={<Wallet className="size-4" />}
          tone={balanceNegative ? 'negative' : 'positive'}
        />
        <StatCard
          label="Tổng ghi có"
          value={<Money value={totalCredit} />}
          hint="Cộng dồn theo sổ cái"
          icon={<TrendingUp className="size-4" />}
        />
        <StatCard
          label="Đã chi trả"
          value={<Money value={totalPaidOut} />}
          hint={`${paidPayouts.length} đợt đã chi`}
          icon={<Banknote className="size-4" />}
        />
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Sổ cái</h2>
        <DataTable
          columns={journalColumns}
          data={entries}
          getRowKey={(e) => e.id}
          emptyMessage="Chưa có bút toán nào."
        />
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">Lịch sử chi trả</h2>
        </div>
        <ErrorBanner error={payoutsError} />
        <DataTable
          columns={payoutColumns}
          data={payouts}
          getRowKey={(p) => p.id}
          emptyMessage="Chưa có đợt chi trả nào."
        />
      </section>
    </div>
  );
}
