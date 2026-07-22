import { Link, useSearchParams, data as routeData } from 'react-router';
import {
  createPayoutInputSchema,
  failPayoutInputSchema,
  markPayoutPaidInputSchema,
  type Paginated,
  type PartnerResponse,
  type PayoutResponse,
  type TenantFinanceSummaryResponse,
  type TenantPayableResponse,
} from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import { Card, CardContent } from '@booking/ui/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@booking/ui/components/ui/tabs';
import { BookText, Scale, ShieldCheck } from 'lucide-react';
import type { Route } from './+types/_index';
import { apiGet, apiPost } from '~/lib/api.server';
import { requireTenant } from '~/features/tenant/server/tenant.server';
import { useTenantArea } from '~/features/tenant/lib/area-context';
import { formatVnd } from '~/lib/format';
import { ErrorBanner } from '~/components/action-feedback';
import { PageHeader } from '~/components/page-header';
import { PaginationBar } from '~/components/pagination-bar';
import { StatCard } from '~/components/stat-card';
import { readListParams } from '~/lib/pagination';
import { dashboardPaths } from '~/constants/paths';
import { BalanceCards } from '~/features/tenant/components/finance/balance-cards';
import { CreatePayoutDialog } from '~/features/tenant/components/finance/create-payout-dialog';
import { PayoutsTable } from '~/features/tenant/components/finance/payouts-table';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Tài chính · Tenant · Bookify' }];
}

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
      payoutsTotal: 0,
      partnerNames: {} as Record<string, string>,
      canPayouts,
      payable: res.ok ? res.data : null,
      payableError: res.ok ? null : (res.error ?? 'Không tính được số tiền phải chi.'),
      error: null as string | null,
    };
  }

  const { toApiQuery } = readListParams(url.searchParams);
  const [summaryRes, payoutsRes, partnersRes] = await Promise.all([
    apiGet<TenantFinanceSummaryResponse>('/tenant/finance/summary', auth),
    canPayouts
      ? apiGet<Paginated<PayoutResponse>>('/tenant/finance/payouts', auth, { query: toApiQuery() })
      : Promise.resolve(null),
    can('tenant.partners.read')
      ? apiGet<Paginated<PartnerResponse>>('/tenant/partners?pageSize=100', auth)
      : Promise.resolve(null),
  ]);

  const partnerNames: Record<string, string> = {};
  if (partnersRes?.ok) for (const p of partnersRes.data?.items ?? []) partnerNames[p.id] = p.name;

  return {
    summary: summaryRes.ok ? summaryRes.data : null,
    payouts: payoutsRes?.ok ? (payoutsRes.data?.items ?? []) : [],
    payoutsTotal: payoutsRes?.ok ? (payoutsRes.data?.total ?? 0) : 0,
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
    if (!res.ok)
      return routeData({ error: res.error ?? 'Không tạo được lệnh chi.' }, { status: 400 });
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
    if (!res.ok)
      return routeData({ error: res.error ?? 'Không cập nhật được lệnh chi.' }, { status: 400 });
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
    if (!res.ok)
      return routeData({ error: res.error ?? 'Không cập nhật được lệnh chi.' }, { status: 400 });
    return { ok: true };
  }

  return routeData({ error: 'Hành động không hợp lệ.' }, { status: 400 });
}

export default function TenantFinance({ loaderData, actionData }: Route.ComponentProps) {
  const { summary, payouts, payoutsTotal, partnerNames, canPayouts, error } = loaderData;
  const { readOnly } = useTenantArea();
  const [searchParams] = useSearchParams();
  const { page, pageSize, pageHref } = readListParams(searchParams);
  const actionError = actionData && 'error' in actionData ? actionData.error : null;

  const partnerBalances = summary?.partnerBalances ?? [];
  const affiliateBalances = summary?.affiliateBalances ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tài chính"
        description="Số dư công nợ, sổ cái và chi trả thủ công cho đối tác."
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link to={dashboardPaths.tenant.settlements}>
                <ShieldCheck className="size-4" /> Tiền đang giữ
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to={dashboardPaths.tenant.ledger}>
                <BookText className="size-4" /> Xem sổ cái
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to={dashboardPaths.tenant.disputes}>
                <Scale className="size-4" /> Tranh chấp
              </Link>
            </Button>
            {canPayouts ? (
              <CreatePayoutDialog
                partnerPayees={partnerBalances.filter((b) => b.ownerId)}
                affiliatePayees={affiliateBalances.filter((b) => b.ownerId)}
                partnerNames={partnerNames}
                readOnly={readOnly}
              />
            ) : null}
          </>
        }
      />

      {error ? (
        <Card>
          <CardContent className="p-4 text-sm text-destructive">{error}</CardContent>
        </Card>
      ) : null}
      <ErrorBanner error={actionError} />

      {summary ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Doanh thu ròng" value={formatVnd(summary.netRevenue)} tone="positive" />
          <StatCard label="Phải trả đối tác" value={formatVnd(summary.partnerPayable)} />
          <StatCard label="Phải trả cộng tác viên" value={formatVnd(summary.affiliatePayable)} />
          <StatCard
            label="Phí nền tảng"
            value={formatVnd(summary.platformFeePayable)}
            tone="muted"
          />
        </div>
      ) : null}

      <Tabs defaultValue="balances">
        <TabsList>
          <TabsTrigger value="balances">Số dư công nợ</TabsTrigger>
          {canPayouts ? <TabsTrigger value="payouts">Lệnh chi</TabsTrigger> : null}
        </TabsList>

        <TabsContent value="balances" className="space-y-6">
          <BalanceCards
            partnerBalances={partnerBalances}
            affiliateBalances={affiliateBalances}
            partnerNames={partnerNames}
          />
        </TabsContent>

        {canPayouts ? (
          <TabsContent value="payouts" className="space-y-4">
            <PayoutsTable payouts={payouts} partnerNames={partnerNames} readOnly={readOnly} />
            <PaginationBar
              page={page}
              pageSize={pageSize}
              total={payoutsTotal}
              hrefFor={pageHref}
            />
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}
