import { useState } from 'react';
import { Form, useNavigation, data as routeData } from 'react-router';
import {
  createPayoutInputSchema,
  markPayoutPaidInputSchema,
  type OwnerBalanceResponse,
  type PartnerResponse,
  type Paginated,
  type PayoutResponse,
  type TenantFinanceSummaryResponse,
} from '@booking/shared';
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
import { Banknote, CircleAlert, Plus } from 'lucide-react';
import type { Route } from './+types/_index';
import { apiGet, apiPost } from '~/lib/api.server';
import { requireTenant } from '../tenant.server';
import { formatVnd } from '../format';
import { BarRow, PageHeader, StatCard } from '../components/page';
import { PayoutStatusBadge } from '../components/status';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Tài chính · Tenant · Bookify' }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { auth, can } = await requireTenant(request, 'tenant.finance.read');
  const canPayouts = can('tenant.payouts.manage');

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

  return routeData({ error: 'Hành động không hợp lệ.' }, { status: 400 });
}

export default function TenantFinance({ loaderData, actionData }: Route.ComponentProps) {
  const { summary, payouts, partnerNames, canPayouts, error } = loaderData;
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
    { header: 'Số tiền', cell: (p) => <span className="font-medium tabular-nums">{formatVnd(p.amount)}</span> },
    { header: 'Trạng thái', cell: (p) => <PayoutStatusBadge status={p.status} /> },
    {
      header: '',
      headClassName: 'text-right',
      className: 'text-right',
      cell: (p) =>
        p.status === 'pending' || p.status === 'processing' ? (
          <MarkPaidDialog payout={p} name={partnerNames[p.payeeId] ?? p.payeeId.slice(0, 8)} />
        ) : p.reference ? (
          <span className="text-xs text-muted-foreground">Ref: {p.reference}</span>
        ) : null,
    },
  ];

  const payeeOptions = partnerBalances.filter((b) => b.ownerId);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tài chính"
        description="Số dư công nợ, sổ cái và chi trả thủ công cho đối tác."
        actions={
          canPayouts ? <CreatePayoutDialog payees={payeeOptions} partnerNames={partnerNames} /> : undefined
        }
      />

      {error ? <Card><CardContent className="p-4 text-sm text-rose-600 dark:text-rose-400">{error}</CardContent></Card> : null}
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
  payees, partnerNames,
}: {
  payees: OwnerBalanceResponse[];
  partnerNames: Record<string, string>;
}) {
  const [open, setOpen] = useState(false);
  const nav = useNavigation();
  const busy = nav.state !== 'idle';

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="size-4" /> Tạo lệnh chi</Button>
      </DialogTrigger>
      <DialogContent>
        <Form method="post" onSubmit={() => setOpen(false)}>
          <input type="hidden" name="intent" value="create-payout" />
          <input type="hidden" name="payeeType" value="partner" />
          <DialogHeader>
            <DialogTitle>Tạo lệnh chi cho đối tác</DialogTitle>
            <DialogDescription>Chi toàn bộ số dư đang nợ của đối tác được chọn.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-4">
            <Label htmlFor="payeeId">Đối tác</Label>
            <Select name="payeeId" required>
              <SelectTrigger id="payeeId"><SelectValue placeholder="Chọn đối tác…" /></SelectTrigger>
              <SelectContent>
                {payees.length === 0 ? (
                  <SelectItem value="none" disabled>Không có số dư phải chi</SelectItem>
                ) : (
                  payees.map((b) => (
                    <SelectItem key={b.ownerId} value={b.ownerId as string}>
                      {(b.ownerId && partnerNames[b.ownerId]) || b.ownerId?.slice(0, 8)} · {formatVnd(b.balance)}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <DialogClose asChild><Button type="button" variant="ghost">Huỷ</Button></DialogClose>
            <Button type="submit" disabled={busy || payees.length === 0}>
              <Banknote className="size-4" /> Tạo lệnh chi
            </Button>
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function MarkPaidDialog({ payout, name }: { payout: PayoutResponse; name: string }) {
  const [open, setOpen] = useState(false);
  const nav = useNavigation();
  const busy = nav.state !== 'idle';

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">Đánh dấu đã chi</Button>
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
