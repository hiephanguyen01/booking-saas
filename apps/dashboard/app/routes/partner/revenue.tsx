import { useMemo } from 'react';
import { Banknote, TrendingUp, Wallet } from 'lucide-react';
import type { LedgerEntryResponse, LedgerEntryTypeDto, PartnerFinanceResponse } from '@booking/shared';
import { cn } from '@booking/ui/lib/utils';
import { DataTable, type DataTableColumn } from '@booking/ui/components/data-table/data-table';
import type { Route } from './+types/revenue';
import { apiGet } from '~/lib/api.server';
import { requirePartner, canPartner } from './partner.server';
import { PageHeader } from './components/page-header';
import { KpiCard } from './components/kpi-card';
import { formatDate, formatVnd } from './components/format';

const ENTRY_LABEL: Record<LedgerEntryTypeDto, string> = {
  booking_revenue: 'Doanh thu đặt chỗ',
  partner_share: 'Phần đối tác',
  platform_fee: 'Phí nền tảng',
  affiliate_commission: 'Hoa hồng CTV',
  promo_discount: 'Giảm giá khuyến mãi',
  cancellation_fee: 'Phí huỷ',
  additional_charge: 'Phụ phí',
  security_deposit: 'Tiền đặt cọc',
  damage_deduction: 'Khấu trừ hư hỏng',
  clawback: 'Thu hồi',
  refund: 'Hoàn tiền',
  payout: 'Chi trả',
};

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Doanh thu · Đối tác · Bookify' }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { auth, membership } = await requirePartner(request);
  if (!canPartner(membership, 'partner.finance.read')) {
    throw new Response('Không có quyền xem tài chính.', { status: 403 });
  }
  const res = await apiGet<PartnerFinanceResponse>('/partner/finance', auth);
  const finance: PartnerFinanceResponse = res.ok && res.data ? res.data : { balance: '0', entries: [] };
  return {
    finance,
    loadError: res.ok ? null : (res.error ?? 'Không tải được dữ liệu tài chính.'),
  };
}

function sumBig(values: string[]): string {
  return values.reduce((acc, v) => acc + BigInt(v || '0'), 0n).toString();
}

export default function PartnerRevenuePage({ loaderData }: Route.ComponentProps) {
  const { finance, loadError } = loaderData;
  const entries = finance.entries;

  const totalCredit = useMemo(() => sumBig(entries.map((e) => e.credit)), [entries]);
  const payouts = useMemo(() => entries.filter((e) => e.entryType === 'payout'), [entries]);
  const totalPaidOut = useMemo(() => sumBig(payouts.map((e) => e.debit)), [payouts]);

  const journalColumns: DataTableColumn<LedgerEntryResponse>[] = [
    {
      header: 'Ngày',
      cell: (e) => <span className="whitespace-nowrap text-sm text-muted-foreground">{formatDate(e.createdAt)}</span>,
    },
    {
      header: 'Hạng mục',
      cell: (e) => (
        <div className="min-w-0">
          <p className="font-medium">{ENTRY_LABEL[e.entryType] ?? e.entryType}</p>
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
          <span
            className={cn(
              'font-medium tabular-nums',
              isCredit ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground',
            )}
          >
            {isCredit ? '+' : '-'}
            {formatVnd(amount)}
          </span>
        );
      },
    },
  ];

  const payoutColumns: DataTableColumn<LedgerEntryResponse>[] = [
    {
      header: 'Ngày',
      cell: (e) => <span className="whitespace-nowrap text-sm text-muted-foreground">{formatDate(e.createdAt)}</span>,
    },
    {
      header: 'Tham chiếu',
      cell: (e) => (
        <span className="font-mono text-xs text-muted-foreground">{e.payoutId ?? e.memo ?? '-'}</span>
      ),
    },
    {
      header: 'Số tiền',
      headClassName: 'text-right',
      className: 'text-right',
      cell: (e) => <span className="font-medium tabular-nums">{formatVnd(e.debit)}</span>,
    },
  ];

  const balanceNegative = finance.balance.startsWith('-');

  return (
    <div className="space-y-5">
      <PageHeader title="Doanh thu" description="Số dư, sổ cái và lịch sử chi trả của bạn." />

      {loadError ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {loadError}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard
          label="Số dư hiện tại"
          value={formatVnd(finance.balance)}
          hint="Số tiền nền tảng còn phải trả bạn"
          icon={Wallet}
          tone={balanceNegative ? 'negative' : 'positive'}
        />
        <KpiCard label="Tổng ghi có" value={formatVnd(totalCredit)} hint="Cộng dồn theo sổ cái" icon={TrendingUp} />
        <KpiCard label="Đã chi trả" value={formatVnd(totalPaidOut)} hint={`${payouts.length} đợt chi trả`} icon={Banknote} />
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
        <h2 className="text-sm font-semibold">Lịch sử chi trả</h2>
        <DataTable
          columns={payoutColumns}
          data={payouts}
          getRowKey={(e) => e.id}
          emptyMessage="Chưa có đợt chi trả nào."
        />
      </section>
    </div>
  );
}
