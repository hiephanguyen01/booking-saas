import { useState } from 'react';
import { Form, Link, useFetcher, useNavigation, data as routeData } from 'react-router';
import {
  createPayoutInputSchema,
  failPayoutInputSchema,
  markPayoutPaidInputSchema,
  type OwnerBalanceResponse,
  type PartnerResponse,
  type Paginated,
  type PayoutResponse,
  type TenantFinanceSummaryResponse,
  type TenantPayableResponse,
} from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@booking/ui/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@booking/ui/components/ui/tabs';
import { DataTable, type DataTableColumn } from '@booking/ui/components/data-table/data-table';
import { Input } from '@booking/ui/components/ui/input';
import { Label } from '@booking/ui/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@booking/ui/components/ui/select';
import {
  Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@booking/ui/components/ui/dialog';
import { Alert, AlertDescription } from '@booking/ui/components/ui/alert';
import { Banknote, BookText, CircleAlert, Plus } from 'lucide-react';
import type { Route } from './+types/_index';
import { apiGet, apiPost } from '~/lib/api.server';
import { requireTenant } from '~/features/tenant/server/tenant.server';
import { PAYOUT_INELIGIBLE_REASON } from '~/constants/finance';
import { useTenantArea } from '~/features/tenant/lib/area-context';
import { formatVnd } from '~/lib/format';
import { Money } from '~/components/money';
import { PageHeader } from '~/components/page-header';
import { BarRow, StatCard } from '~/components/stat-card';
import { PayoutStatusBadge } from '~/components/status-badge';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Tài chính · Tenant · Bookify' }];
}

/**
 * Why a payout run would be rejected — mirrors the exact codes `POST /tenant/finance/payouts`
 * returns, so the dialog can gray out its submit before the user hits a hard 400.
 */

export async function loader({ request }: Route.LoaderArgs) {
  const { auth, can } = await requireTenant(request, 'tenant.finance.read');
  const canPayouts = can('tenant.payouts.manage');

  // The create-payout dialog re-loads this route with ?payeeType&payeeId to preview the
  // TRUE payable for the selected payee. That number — `available` = maturePayable − outstanding
  // — is what a run actually pays; the raw ledger balance is not, and showing it is what made
  // a run 400 with NOTHING_TO_PAY/BELOW_MINIMUM on a payee that looked flush.
  const url = new URL(request.url);
  const previewType = url.searchParams.get('payeeType');
  const previewId = url.searchParams.get('payeeId');
  if (canPayouts && (previewType === 'partner' || previewType === 'affiliate') && previewId) {
    const res = await apiGet<TenantPayableResponse>(
      `/tenant/finance/payable?payeeType=${previewType}&payeeId=${encodeURIComponent(previewId)}`,
      auth,
    );
    return {
      summary: null as TenantFinanceSummaryResponse | null,
      payouts: [] as PayoutResponse[],
      partnerNames: {} as Record<string, string>,
      canPayouts,
      payable: res.ok ? res.data : null,
      payableError: res.ok ? null : (res.error ?? 'Không tính được số tiền phải chi.'),
      error: null as string | null,
    };
  }

  const [summaryRes, payoutsRes, partnersRes] = await Promise.all([
    apiGet<TenantFinanceSummaryResponse>('/tenant/finance/summary', auth),
    canPayouts ? apiGet<PayoutResponse[]>('/tenant/finance/payouts', auth) : Promise.resolve(null),
    can('tenant.partners.read')
      ? apiGet<Paginated<PartnerResponse>>('/tenant/partners?pageSize=100', auth)
      : Promise.resolve(null),
  ]);

  const partnerNames: Record<string, string> = {};
  if (partnersRes?.ok) for (const p of partnersRes.data?.items ?? []) partnerNames[p.id] = p.name;

  return {
    summary: summaryRes.ok ? summaryRes.data : null,
    payouts: payoutsRes?.ok ? (payoutsRes.data ?? []) : [],
    partnerNames,
    canPayouts,
    payable: null as TenantPayableResponse | null,
    payableError: null as string | null,
    error: summaryRes.ok ? null : (summaryRes.error ?? 'Không tải được dữ liệu tài chính.'),
  };
}

export async function action({ request }: Route.ActionArgs) {
  const { auth } = await requireTenant(request, 'tenant.payouts.manage');
  const form = await request.formData();
  const intent = String(form.get('intent'));

  if (intent === 'create-payout') {
    const parsed = createPayoutInputSchema.safeParse({
      payeeType: form.get('payeeType'),
      payeeId: form.get('payeeId'),
    });
    if (!parsed.success) {
      return routeData({ error: 'Thông tin lệnh chi không hợp lệ.' }, { status: 400 });
    }
    const res = await apiPost('/tenant/finance/payouts', parsed.data, auth);
    if (!res.ok) return routeData({ error: res.error ?? 'Không tạo được lệnh chi.' }, { status: 400 });
    return { ok: true };
  }

  if (intent === 'mark-paid') {
    const id = String(form.get('payoutId'));
    const parsed = markPayoutPaidInputSchema.safeParse({
      reference: form.get('reference'),
      evidenceKey: form.get('evidenceKey') || undefined,
    });
    if (!parsed.success) {
      return routeData({ error: 'Cần số tham chiếu chuyển khoản.' }, { status: 400 });
    }
    const res = await apiPost(`/tenant/finance/payouts/${id}/mark-paid`, parsed.data, auth);
    if (!res.ok) return routeData({ error: res.error ?? 'Không cập nhật được lệnh chi.' }, { status: 400 });
    return { ok: true };
  }

  if (intent === 'mark-failed') {
    const id = String(form.get('payoutId'));
    const reason = String(form.get('reason') ?? '').trim();
    const parsed = failPayoutInputSchema.safeParse({ reason: reason || undefined });
    if (!parsed.success) {
      return routeData({ error: 'Lý do không hợp lệ.' }, { status: 400 });
    }
    const res = await apiPost(`/tenant/finance/payouts/${id}/fail`, parsed.data, auth);
    if (!res.ok) return routeData({ error: res.error ?? 'Không cập nhật được lệnh chi.' }, { status: 400 });
    return { ok: true };
  }

  return routeData({ error: 'Hành động không hợp lệ.' }, { status: 400 });
}

export default function TenantFinance({ loaderData, actionData }: Route.ComponentProps) {
  const { summary, payouts, partnerNames, canPayouts, error } = loaderData;
  const { readOnly } = useTenantArea();
  const actionError = actionData && 'error' in actionData ? actionData.error : null;

  const partnerBalances = summary?.partnerBalances ?? [];
  const affiliateBalances = summary?.affiliateBalances ?? [];
  const balMax = [...partnerBalances, ...affiliateBalances].reduce(
    (m, b) => Math.max(m, Math.abs(Number(b.balance))),
    0,
  );

  const label = (b: OwnerBalanceResponse) =>
    (b.ownerId && partnerNames[b.ownerId]) || (b.ownerId ? b.ownerId.slice(0, 8) : b.ownerType);

  const payoutColumns: DataTableColumn<PayoutResponse>[] = [
    { header: 'Người nhận', cell: (p) => <span className="text-sm">{partnerNames[p.payeeId] ?? p.payeeId.slice(0, 8)}</span> },
    { header: 'Loại', cell: (p) => <span className="text-sm text-muted-foreground">{p.payeeType === 'partner' ? 'Đối tác' : 'Affiliate'}</span> },
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
              <MarkPaidDialog payout={p} name={partnerNames[p.payeeId] ?? p.payeeId.slice(0, 8)} readOnly={readOnly} />
              <MarkFailedDialog payout={p} name={partnerNames[p.payeeId] ?? p.payeeId.slice(0, 8)} readOnly={readOnly} />
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

  const partnerPayees = partnerBalances.filter((b) => b.ownerId);
  const affiliatePayees = affiliateBalances.filter((b) => b.ownerId);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tài chính"
        description="Số dư công nợ, sổ cái và chi trả thủ công cho đối tác."
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link to="/tenant/finance/ledger">
                <BookText className="size-4" /> Xem sổ cái
              </Link>
            </Button>
            {canPayouts ? (
              <CreatePayoutDialog
                partnerPayees={partnerPayees}
                affiliatePayees={affiliatePayees}
                partnerNames={partnerNames}
                readOnly={readOnly}
              />
            ) : null}
          </>
        }
      />

      {error ? <Card><CardContent className="p-4 text-sm text-destructive">{error}</CardContent></Card> : null}
      {actionError ? (
        <Alert variant="destructive"><CircleAlert className="size-4" /><AlertDescription>{actionError}</AlertDescription></Alert>
      ) : null}

      {summary ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Doanh thu ròng" value={formatVnd(summary.netRevenue)} tone="positive" />
          <StatCard label="Phải trả đối tác" value={formatVnd(summary.partnerPayable)} />
          <StatCard label="Phải trả affiliate" value={formatVnd(summary.affiliatePayable)} />
          <StatCard label="Phí nền tảng" value={formatVnd(summary.platformFeePayable)} tone="muted" />
        </div>
      ) : null}

      <Tabs defaultValue="balances">
        <TabsList>
          <TabsTrigger value="balances">Số dư công nợ</TabsTrigger>
          {canPayouts ? <TabsTrigger value="payouts">Lệnh chi</TabsTrigger> : null}
        </TabsList>

        <TabsContent value="balances" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <BalanceCard title="Đối tác" description="Số dư đang nợ mỗi đối tác" balances={partnerBalances} max={balMax} label={label} tone="emerald" />
            <BalanceCard title="Affiliate" description="Hoa hồng phải trả cho affiliate" balances={affiliateBalances} max={balMax} label={label} tone="sky" />
          </div>
        </TabsContent>

        {canPayouts ? (
          <TabsContent value="payouts" className="space-y-4">
            <DataTable columns={payoutColumns} data={payouts} getRowKey={(p) => p.id} emptyMessage="Chưa có lệnh chi nào." />
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}

function BalanceCard({
  title, description, balances, max, label, tone,
}: {
  title: string;
  description: string;
  balances: OwnerBalanceResponse[];
  max: number;
  label: (b: OwnerBalanceResponse) => string;
  tone: 'emerald' | 'sky';
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {balances.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">Chưa phát sinh công nợ.</p>
        ) : (
          balances.map((b) => (
            <BarRow
              key={`${b.ownerType}-${b.ownerId}`}
              label={label(b)}
              value={Number(b.balance)}
              max={max}
              display={formatVnd(b.balance)}
              tone={tone}
            />
          ))
        )}
      </CardContent>
    </Card>
  );
}

function CreatePayoutDialog({
  partnerPayees, affiliatePayees, partnerNames, readOnly,
}: {
  partnerPayees: OwnerBalanceResponse[];
  affiliatePayees: OwnerBalanceResponse[];
  partnerNames: Record<string, string>;
  readOnly: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [payeeType, setPayeeType] = useState<'partner' | 'affiliate'>('partner');
  const [payeeId, setPayeeId] = useState('');
  const nav = useNavigation();
  const busy = nav.state !== 'idle';
  // Loads GET /tenant/finance?payeeType&payeeId (this route's loader) → the payee's TRUE payable.
  const preview = useFetcher<typeof loader>();
  const payable = preview.data?.payable ?? null;
  const payableError = preview.data?.payableError ?? null;
  const loadingPayable = preview.state !== 'idle';

  const payees = payeeType === 'partner' ? partnerPayees : affiliatePayees;
  const nameOf = (id: string): string =>
    payeeType === 'partner' ? partnerNames[id] ?? id.slice(0, 8) : id.slice(0, 8);

  const loadPayable = (type: 'partner' | 'affiliate', id: string): void => {
    if (id) preview.load(`/tenant/finance?payeeType=${type}&payeeId=${encodeURIComponent(id)}`);
  };
  const onTypeChange = (v: 'partner' | 'affiliate'): void => {
    setPayeeType(v);
    setPayeeId('');
  };
  const onPayeeChange = (id: string): void => {
    setPayeeId(id);
    loadPayable(payeeType, id);
  };

  // The number the run will actually pay is `available`; only an eligible payee can be paid.
  const showPreview = payeeId !== '' && payable !== null && payable.payeeId === payeeId;
  const eligible = showPreview && payable.eligible;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" disabled={readOnly}><Plus className="size-4" /> Tạo lệnh chi</Button>
      </DialogTrigger>
      <DialogContent>
        <Form method="post" onSubmit={() => setOpen(false)}>
          <input type="hidden" name="intent" value="create-payout" />
          <input type="hidden" name="payeeType" value={payeeType} />
          <DialogHeader>
            <DialogTitle>Tạo lệnh chi</DialogTitle>
            <DialogDescription>
              Chi số dư đã qua thời gian giữ của bên nhận — đây là số tiền lệnh chi thực trả.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Loại người nhận</Label>
              <Select value={payeeType} onValueChange={(v) => onTypeChange(v as 'partner' | 'affiliate')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="partner">Đối tác</SelectItem>
                  <SelectItem value="affiliate">Affiliate</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="payeeId">Người nhận</Label>
              <Select name="payeeId" required value={payeeId} onValueChange={onPayeeChange} key={payeeType}>
                <SelectTrigger id="payeeId"><SelectValue placeholder="Chọn người nhận…" /></SelectTrigger>
                <SelectContent>
                  {payees.length === 0 ? (
                    <SelectItem value="none" disabled>Không có số dư phải chi</SelectItem>
                  ) : (
                    payees.map((b) => (
                      <SelectItem key={b.ownerId} value={b.ownerId as string}>
                        {nameOf(b.ownerId as string)} · số dư {formatVnd(b.balance)}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            {payeeId !== '' ? (
              <PayablePreview
                loading={loadingPayable}
                error={payableError}
                payable={showPreview ? payable : null}
              />
            ) : null}
          </div>
          <DialogFooter>
            <DialogClose asChild><Button type="button" variant="ghost">Huỷ</Button></DialogClose>
            <Button type="submit" disabled={busy || loadingPayable || !eligible}>
              <Banknote className="size-4" /> Tạo lệnh chi
            </Button>
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

/** The TRUE payable for the selected payee: the headline `available` plus every input that shaped it. */
function PayablePreview({
  loading, error, payable,
}: {
  loading: boolean;
  error: string | null;
  payable: TenantPayableResponse | null;
}) {
  if (loading) {
    return <p className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">Đang tính số tiền phải chi…</p>;
  }
  if (error) {
    return (
      <Alert variant="destructive">
        <CircleAlert className="size-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }
  if (!payable) return null;

  return (
    <div className="space-y-3 rounded-md border bg-muted/40 p-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm text-muted-foreground">Lệnh chi sẽ trả</span>
        <Money value={payable.available} className="text-lg font-semibold" />
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
        <dt>Số dư sổ cái</dt>
        <dd className="text-right"><Money value={payable.balance} /></dd>
        <dt>Đã qua thời gian giữ</dt>
        <dd className="text-right"><Money value={payable.maturePayable} /></dd>
        <dt>Đang trong lệnh chi khác</dt>
        <dd className="text-right">−<Money value={payable.outstanding} /></dd>
        <dt>Thời gian giữ</dt>
        <dd className="text-right tabular-nums">{payable.holdingDays} ngày</dd>
        <dt>Mức tối thiểu / kỳ</dt>
        <dd className="text-right"><Money value={payable.minAmount} /></dd>
      </dl>
      {!payable.eligible && payable.ineligibleReason ? (
        <p className="flex items-start gap-1.5 text-xs text-warning-foreground">
          <CircleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
          {PAYOUT_INELIGIBLE_REASON[payable.ineligibleReason]}
        </p>
      ) : null}
    </div>
  );
}

function MarkFailedDialog({ payout, name, readOnly }: { payout: PayoutResponse; name: string; readOnly: boolean }) {
  const [open, setOpen] = useState(false);
  const nav = useNavigation();
  const busy = nav.state !== 'idle';

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" disabled={readOnly}>
          Đánh dấu thất bại
        </Button>
      </DialogTrigger>
      <DialogContent>
        <Form method="post" onSubmit={() => setOpen(false)}>
          <input type="hidden" name="intent" value="mark-failed" />
          <input type="hidden" name="payoutId" value={payout.id} />
          <DialogHeader>
            <DialogTitle>Đánh dấu lệnh chi thất bại</DialogTitle>
            <DialogDescription>
              {name} · {formatVnd(payout.amount)}. Công nợ sẽ được đưa lại vào chu kỳ chi trả kế tiếp.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-4">
            <Label htmlFor={`fail-${payout.id}`}>Lý do (tuỳ chọn)</Label>
            <Input id={`fail-${payout.id}`} name="reason" maxLength={500} placeholder="VD: sai số tài khoản" />
          </div>
          <DialogFooter>
            <DialogClose asChild><Button type="button" variant="ghost">Huỷ</Button></DialogClose>
            <Button type="submit" variant="destructive" disabled={busy}>Xác nhận thất bại</Button>
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function MarkPaidDialog({ payout, name, readOnly }: { payout: PayoutResponse; name: string; readOnly: boolean }) {
  const [open, setOpen] = useState(false);
  const nav = useNavigation();
  const busy = nav.state !== 'idle';

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={readOnly}>Đánh dấu đã chi</Button>
      </DialogTrigger>
      <DialogContent>
        <Form method="post" onSubmit={() => setOpen(false)}>
          <input type="hidden" name="intent" value="mark-paid" />
          <input type="hidden" name="payoutId" value={payout.id} />
          <DialogHeader>
            <DialogTitle>Xác nhận đã chi trả</DialogTitle>
            <DialogDescription>
              {name} · {formatVnd(payout.amount)}. Nhập chứng từ chuyển khoản.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor={`ref-${payout.id}`}>Số tham chiếu chuyển khoản</Label>
              <Input id={`ref-${payout.id}`} name="reference" required maxLength={200} placeholder="VD: FT24123456789" />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`ev-${payout.id}`}>Mã chứng từ (tuỳ chọn)</Label>
              <Input id={`ev-${payout.id}`} name="evidenceKey" maxLength={500} placeholder="Khoá tệp bằng chứng đã tải lên" />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild><Button type="button" variant="ghost">Huỷ</Button></DialogClose>
            <Button type="submit" disabled={busy}>Xác nhận đã chi</Button>
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
