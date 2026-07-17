import { useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { TrendingUp, Wallet } from 'lucide-react';
import type {
  LedgerEntryResponse,
  Paginated,
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
import { PaginationBar } from '~/components/pagination-bar';
import { StatCard } from '~/components/stat-card';
import { readListParams } from '~/lib/pagination';
import { Money, amountToneClass } from '~/components/money';
import { CopyableCode } from '~/components/copyable-code';
import { PayoutStatusBadge } from '~/components/status-badge';
import { formatDate } from '~/lib/format';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Doanh thu · Đối tác · Bookify' }];
}

export async function loader({ request, url }: Route.LoaderArgs) {
  const { auth } = await requirePartner(request, 'partner.finance.read');
  // Two paginated tables on one page → namespace the ledger pager so it never
  // collides with the payout pager. `/partner/finance` stays balance + a recent
  // ledger preview; the full journal comes from the paginated ledger endpoint.
  const ledgerParams = readListParams(url.searchParams, {
    pageKey: 'ledgerPage',
    pageSizeKey: 'ledgerPageSize',
  });
  const payoutParams = readListParams(url.searchParams);
  const [financeRes, ledgerRes, payoutsRes] = await Promise.all([
    apiGet<PartnerFinanceResponse>('/partner/finance', auth),
    apiGet<Paginated<LedgerEntryResponse>>('/partner/finance/ledger', auth, {
      query: ledgerParams.toApiQuery(),
    }),
    apiGet<Paginated<PayoutResponse>>('/partner/finance/payouts', auth, {
      query: payoutParams.toApiQuery(),
    }),
  ]);
  const finance: PartnerFinanceResponse =
    financeRes.ok && financeRes.data ? financeRes.data : { balance: '0', entries: [] };
  return {
    finance,
    ledger: ledgerRes.ok && ledgerRes.data ? ledgerRes.data.items : [],
    ledgerTotal: ledgerRes.ok && ledgerRes.data ? ledgerRes.data.total : 0,
    payouts: payoutsRes.ok && payoutsRes.data ? payoutsRes.data.items : [],
    payoutsTotal: payoutsRes.ok && payoutsRes.data ? payoutsRes.data.total : 0,
    financeError: financeRes.ok ? null : (financeRes.error ?? 'Không tải được dữ liệu tài chính.'),
    ledgerError: ledgerRes.ok ? null : (ledgerRes.error ?? 'Không tải được sổ cái.'),
    payoutsError: payoutsRes.ok ? null : (payoutsRes.error ?? 'Không tải được lịch sử chi trả.'),
  };
}

function sumBig(values: string[]): string {
  return values.reduce((acc, v) => acc + BigInt(v || '0'), 0n).toString();
}

export default function PartnerRevenuePage({ loaderData }: Route.ComponentProps) {
  const { finance, ledger, ledgerTotal, payouts, payoutsTotal, financeError, ledgerError, payoutsError } =
    loaderData;
  const [searchParams] = useSearchParams();
  const ledgerParams = readListParams(searchParams, {
    pageKey: 'ledgerPage',
    pageSizeKey: 'ledgerPageSize',
  });
  const payoutParams = readListParams(searchParams);
  // `finance.entries` is a small recent preview from /partner/finance — used only
  // for the "Tổng ghi có" tile; the full journal below is server-paginated.
  const entries = finance.entries;

  const totalCredit = useMemo(() => sumBig(entries.map((e) => e.credit)), [entries]);

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

      <div className="grid gap-4 sm:grid-cols-2">
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
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Sổ cái</h2>
        <ErrorBanner error={ledgerError} />
        <DataTable
          columns={journalColumns}
          data={ledger}
          getRowKey={(e) => e.id}
          emptyMessage="Chưa có bút toán nào."
        />
        <PaginationBar
          page={ledgerParams.page}
          pageSize={ledgerParams.pageSize}
          total={ledgerTotal}
          hrefFor={ledgerParams.pageHref}
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
        <PaginationBar
          page={payoutParams.page}
          pageSize={payoutParams.pageSize}
          total={payoutsTotal}
          hrefFor={payoutParams.pageHref}
        />
      </section>
    </div>
  );
}
