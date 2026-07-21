import { useMemo } from 'react';
import { data as routeData, Form, useNavigation, useSearchParams } from 'react-router';
import { Clock3, HandCoins, Scale, TrendingUp, Wallet } from 'lucide-react';
import type {
  LedgerEntryResponse,
  Paginated,
  PartnerFinanceResponse,
  PayoutResponse,
  PartnerSettlementDisputeResponse,
  SettlementSummaryResponse,
} from '@booking/contracts';
import { respondSettlementDisputeInputSchema } from '@booking/contracts';
import { cn } from '@booking/ui/lib/utils';
import { DataTable, type DataTableColumn } from '@booking/ui/components/data-table/data-table';
import { InfoHint } from '@booking/ui/components/ui/info-hint';
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
import { formatDateTime } from '~/lib/format';
import { apiPost } from '~/lib/api.server';
import { Badge } from '@booking/ui/components/ui/badge';
import { Button } from '@booking/ui/components/ui/button';
import { Card, CardContent } from '@booking/ui/components/ui/card';
import { Label } from '@booking/ui/components/ui/label';
import { Textarea } from '@booking/ui/components/ui/textarea';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Doanh thu · Đối tác · Bookify' }];
}

export async function loader({ request, url }: Route.LoaderArgs) {
  const { auth, can } = await requirePartner(request, 'partner.finance.read');
  // Two paginated tables on one page → namespace the ledger pager so it never
  // collides with the payout pager. `/partner/finance` stays balance + a recent
  // ledger preview; the full journal comes from the paginated ledger endpoint.
  const ledgerParams = readListParams(url.searchParams, {
    pageKey: 'ledgerPage',
    pageSizeKey: 'ledgerPageSize',
  });
  const payoutParams = readListParams(url.searchParams);
  const disputeParams = readListParams(url.searchParams, {
    pageKey: 'disputePage',
    pageSizeKey: 'disputePageSize',
  });
  const [financeRes, ledgerRes, payoutsRes, settlementSummaryRes, disputesRes] = await Promise.all([
    apiGet<PartnerFinanceResponse>('/partner/finance', auth),
    apiGet<Paginated<LedgerEntryResponse>>('/partner/finance/ledger', auth, {
      query: ledgerParams.toApiQuery(),
    }),
    apiGet<Paginated<PayoutResponse>>('/partner/finance/payouts', auth, {
      query: payoutParams.toApiQuery(),
    }),
    apiGet<SettlementSummaryResponse>('/partner/finance/settlement-summary', auth),
    apiGet<Paginated<PartnerSettlementDisputeResponse>>('/partner/finance/disputes', auth, {
      query: disputeParams.toApiQuery(),
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
    settlementSummary:
      settlementSummaryRes.ok && settlementSummaryRes.data ? settlementSummaryRes.data : null,
    disputes: disputesRes.ok && disputesRes.data ? disputesRes.data.items : [],
    disputesTotal: disputesRes.ok && disputesRes.data ? disputesRes.data.total : 0,
    canRespondToDisputes: can('partner.disputes.respond'),
    financeError: financeRes.ok ? null : (financeRes.error ?? 'Không tải được dữ liệu tài chính.'),
    ledgerError: ledgerRes.ok ? null : (ledgerRes.error ?? 'Không tải được sổ cái.'),
    payoutsError: payoutsRes.ok ? null : (payoutsRes.error ?? 'Không tải được lịch sử chi trả.'),
    settlementsError: settlementSummaryRes.ok
      ? null
      : (settlementSummaryRes.error ?? 'Không tải được trạng thái đối soát.'),
    disputesError: disputesRes.ok
      ? null
      : (disputesRes.error ?? 'Không tải được tranh chấp liên quan.'),
  };
}

export async function action({ request }: Route.ActionArgs) {
  const { auth } = await requirePartner(request, 'partner.disputes.respond');
  const form = await request.formData();
  const disputeId = String(form.get('disputeId') ?? '');
  const parsed = respondSettlementDisputeInputSchema.safeParse({ response: form.get('response') });
  if (!parsed.success) {
    return routeData({ error: 'Phản hồi phải có ít nhất 10 ký tự.' }, { status: 400 });
  }
  const result = await apiPost<PartnerSettlementDisputeResponse>(
    `/partner/finance/disputes/${encodeURIComponent(disputeId)}/respond`,
    parsed.data,
    auth,
  );
  if (!result.ok) {
    return routeData({ error: result.error ?? 'Không gửi được phản hồi.' }, { status: 400 });
  }
  return { ok: true };
}

function sumBig(values: string[]): string {
  return values.reduce((acc, v) => acc + BigInt(v || '0'), 0n).toString();
}

export default function PartnerRevenuePage({ loaderData, actionData }: Route.ComponentProps) {
  const {
    finance,
    ledger,
    ledgerTotal,
    payouts,
    payoutsTotal,
    settlementSummary,
    disputes,
    disputesTotal,
    canRespondToDisputes,
    financeError,
    ledgerError,
    payoutsError,
    settlementsError,
    disputesError,
  } = loaderData;
  const navigation = useNavigation();
  const [searchParams] = useSearchParams();
  const ledgerParams = readListParams(searchParams, {
    pageKey: 'ledgerPage',
    pageSizeKey: 'ledgerPageSize',
  });
  const payoutParams = readListParams(searchParams);
  const disputeParams = readListParams(searchParams, {
    pageKey: 'disputePage',
    pageSizeKey: 'disputePageSize',
  });
  // `finance.entries` is a small recent preview from /partner/finance — used only
  // for the "Tổng ghi có" tile; the full journal below is server-paginated.
  const entries = finance.entries;

  const totalCredit = useMemo(() => sumBig(entries.map((e) => e.credit)), [entries]);
  const settlementTotals = {
    held: settlementSummary?.heldPartnerPayableAmount ?? '0',
    disputed: settlementSummary?.disputedPartnerPayableAmount ?? '0',
    pending: settlementSummary?.payoutPendingAmount ?? '0',
    paid: settlementSummary?.paidAmount ?? '0',
  };

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

      <ErrorBanner error={settlementsError} />

      <ErrorBanner error={disputesError} />

      <ErrorBanner error={actionData && 'error' in actionData ? actionData.error : null} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          label="Số dư hiện tại"
          value={<Money value={finance.balance} />}
          hint="Số tiền Tenant còn phải trả bạn"
          icon={<Wallet className="size-4" />}
          tone={balanceNegative ? 'negative' : 'positive'}
        />
        <StatCard
          label={
            <span className="inline-flex items-center gap-1">
              Tổng ghi có
              <InfoHint>Tổng tiền đã ghi có vào số dư của bạn.</InfoHint>
            </span>
          }
          value={<Money value={totalCredit} />}
          hint="Cộng dồn theo sổ cái"
          icon={<TrendingUp className="size-4" />}
        />
        <StatCard
          label={
            <span className="inline-flex items-center gap-1">
              Đang giữ/chờ tranh chấp
              <InfoHint>
                Tiền tạm giữ do đang trong thời gian giữ hoặc có tranh chấp.
              </InfoHint>
            </span>
          }
          value={<Money value={settlementTotals.held} />}
          hint="Chưa đủ điều kiện vào kỳ chi"
          icon={<Clock3 className="size-4" />}
        />
        <StatCard
          label="Đang tranh chấp"
          value={<Money value={settlementTotals.disputed} />}
          hint="Tạm khóa cho đến khi Tenant xử lý"
          icon={<Scale className="size-4" />}
        />
        <StatCard
          label={
            <span className="inline-flex items-center gap-1">
              Đang chờ chuyển
              <InfoHint>
                Tiền đã đủ điều kiện, đang chờ chuyển về tài khoản của bạn.
              </InfoHint>
            </span>
          }
          value={<Money value={settlementTotals.pending} />}
          hint="Đã nằm trong lệnh chi"
          icon={<HandCoins className="size-4" />}
        />
        <StatCard
          label="Đã được chi"
          value={<Money value={settlementTotals.paid} />}
          hint="Theo allocation của từng booking"
          icon={<Wallet className="size-4" />}
        />
      </div>

      {disputes.length ? (
        <section id="disputes" className="scroll-mt-24 space-y-3">
          <h2 className="text-sm font-semibold">Tranh chấp liên quan</h2>
          {disputes.map((dispute) => {
            const submitting =
              navigation.state === 'submitting' &&
              navigation.formData?.get('disputeId') === dispute.id;
            return (
              <Card key={dispute.id}>
                <CardContent className="space-y-4 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-mono text-sm font-medium">
                        {dispute.bookingCode ?? dispute.bookingId.slice(0, 8)}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {dispute.listingTitle ?? '—'} · {formatDateTime(dispute.createdAt)}
                      </p>
                    </div>
                    <div className="text-right">
                      <Money value={dispute.remainingHeldAmount} className="font-semibold" />
                      <div className="mt-1">
                        <Badge variant={dispute.status === 'open' ? 'destructive' : 'secondary'}>
                          {dispute.status === 'open' ? 'Chờ Tenant xử lý' : 'Đã xử lý'}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  <p className="rounded-md bg-muted/50 p-3 text-sm leading-6">{dispute.reason}</p>
                  {dispute.partnerResponse ? (
                    <div className="border-t pt-3 text-sm">
                      <p className="font-medium">Phản hồi của bạn</p>
                      <p className="mt-1 text-muted-foreground">{dispute.partnerResponse}</p>
                    </div>
                  ) : dispute.status === 'open' && canRespondToDisputes ? (
                    <Form method="post" className="space-y-3 border-t pt-4">
                      <input type="hidden" name="disputeId" value={dispute.id} />
                      <Label htmlFor={`partner-response-${dispute.id}`}>Thông tin đối chiếu</Label>
                      <Textarea
                        id={`partner-response-${dispute.id}`}
                        name="response"
                        required
                        minLength={10}
                        maxLength={2000}
                        rows={3}
                        placeholder="Mô tả việc hoàn thành dịch vụ, thanh toán tại chỗ và bằng chứng liên quan…"
                      />
                      <div className="text-right">
                        <Button type="submit" disabled={submitting}>
                          {submitting ? 'Đang gửi…' : 'Gửi phản hồi'}
                        </Button>
                      </div>
                    </Form>
                  ) : dispute.status === 'open' ? (
                    <p className="border-t pt-3 text-sm text-muted-foreground">
                      Bạn cần quyền cập nhật booking để gửi thông tin đối chiếu.
                    </p>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
          <PaginationBar
            page={disputeParams.page}
            pageSize={disputeParams.pageSize}
            total={disputesTotal}
            hrefFor={disputeParams.pageHref}
          />
        </section>
      ) : (
        <section id="disputes" className="scroll-mt-24 space-y-3">
          <h2 className="text-sm font-semibold">Tranh chấp liên quan</h2>
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              Chưa có khiếu nại nào liên quan đến các booking của bạn.
            </CardContent>
          </Card>
        </section>
      )}

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
