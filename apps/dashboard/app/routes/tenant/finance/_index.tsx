import { Link, useSearchParams, data as routeData } from 'react-router';
import {
  createCommissionRuleInputSchema,
  createPayoutInputSchema,
  failPayoutInputSchema,
  markPayoutPaidInputSchema,
  updateCommissionRuleInputSchema,
  type CommissionRuleResponse,
  type ListingTypeResponse,
  type Paginated,
  type PartnerResponse,
  type PayoutResponse,
  type PromotionCategoryOption,
  type TenantFinanceSummaryResponse,
  type TenantPayableResponse,
} from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import { Card, CardContent } from '@booking/ui/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@booking/ui/components/ui/tabs';
import { BookText, Scale, ShieldCheck } from 'lucide-react';
import type { Route } from './+types/_index';
import { apiDelete, apiGet, apiPatch, apiPost } from '~/lib/api.server';
import { requireTenant } from '~/features/tenant/server/tenant.server';
import { useTenantArea } from '~/features/tenant/lib/area-context';
import { formatVnd } from '~/lib/format';
import { ErrorBanner, SuccessBanner } from '~/components/action-feedback';
import { PageHeader } from '~/components/page-header';
import { PaginationBar } from '~/components/pagination-bar';
import { StatCard } from '~/components/stat-card';
import { readListParams } from '~/lib/pagination';
import { dashboardPaths } from '~/constants/paths';
import { BalanceCards } from '~/features/tenant/components/finance/balance-cards';
import { CreatePayoutDialog } from '~/features/tenant/components/finance/create-payout-dialog';
import { PayoutsTable } from '~/features/tenant/components/finance/payouts-table';
import { CommissionRulesPanel } from '~/features/tenant/components/finance/commission-rules-panel';
import type { CommissionTargetOptions } from '~/features/tenant/lib/commission-rules';
import {
  readCommissionRatePatch,
  readCreateCommissionRule,
} from '~/features/tenant/server/commission-rule-form.server';
import { apiPaths, FETCH_ALL_PAGE_SIZE } from '~/constants/api-paths';
import { actionMessages } from '~/constants/messages';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Tài chính · Tenant · BookingOS' }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { auth, can } = await requireTenant(request, 'tenant.finance.read');
  const canPayouts = can('tenant.payouts.manage');
  const canCommissions = can('tenant.commissions.manage');

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
      canCommissions,
      commissionRules: [] as CommissionRuleResponse[],
      commissionTargets: emptyCommissionTargets(),
      payable: res.ok ? res.data : null,
      payableError: res.ok ? null : (res.error ?? 'Không tính được số tiền phải chi.'),
      error: null as string | null,
    };
  }

  const { toApiQuery } = readListParams(url.searchParams);
  const [summaryRes, payoutsRes, partnersRes, commissionRes, listingTypesRes, categoriesRes] =
    await Promise.all([
      apiGet<TenantFinanceSummaryResponse>(apiPaths.tenant.financeSummary, auth),
      canPayouts
        ? apiGet<Paginated<PayoutResponse>>(apiPaths.tenant.payouts, auth, {
            query: toApiQuery(),
          })
        : Promise.resolve(null),
      can('tenant.partners.read')
        ? apiGet<Paginated<PartnerResponse>>(apiPaths.tenant.partners, auth, { query: { pageSize: FETCH_ALL_PAGE_SIZE } })
        : Promise.resolve(null),
      canCommissions
        ? apiGet<CommissionRuleResponse[]>(apiPaths.tenant.commissionRules, auth)
        : Promise.resolve(null),
      canCommissions && can('tenant.listings.read')
        ? apiGet<ListingTypeResponse[]>(apiPaths.tenant.listingTypes, auth, { query: { includeInactive: true } })
        : Promise.resolve(null),
      canCommissions && can('tenant.promotions.manage')
        ? apiGet<PromotionCategoryOption[]>(apiPaths.tenant.promotionCategories, auth)
        : Promise.resolve(null),
    ]);

  const partnerNames: Record<string, string> = {};
  if (partnersRes?.ok) for (const p of partnersRes.data?.items ?? []) partnerNames[p.id] = p.name;
  const commissionTargets: CommissionTargetOptions = {
    partners: (partnersRes?.ok ? (partnersRes.data?.items ?? []) : []).map((partner) => ({
      id: partner.id,
      label: partner.name,
    })),
    listingTypes: (listingTypesRes?.ok ? (listingTypesRes.data ?? []) : []).map((type) => ({
      id: type.id,
      label: type.name,
    })),
    categories: (categoriesRes?.ok ? (categoriesRes.data ?? []) : []).map((category) => ({
      id: category.id,
      label: category.name,
    })),
  };

  return {
    summary: summaryRes.ok ? summaryRes.data : null,
    payouts: payoutsRes?.ok ? (payoutsRes.data?.items ?? []) : [],
    payoutsTotal: payoutsRes?.ok ? (payoutsRes.data?.total ?? 0) : 0,
    partnerNames,
    canPayouts,
    canCommissions,
    commissionRules: commissionRes?.ok ? (commissionRes.data ?? []) : [],
    commissionTargets,
    payable: null as TenantPayableResponse | null,
    payableError: null as string | null,
    error: summaryRes.ok ? null : (summaryRes.error ?? 'Không tải được dữ liệu tài chính.'),
  };
}

export async function action({ request }: Route.ActionArgs) {
  const { auth, can } = await requireTenant(request);
  const form = await request.formData();
  const intent = String(form.get('intent'));

  if (
    intent === 'create-commission-rule' ||
    intent === 'update-commission-rule' ||
    intent === 'delete-commission-rule'
  ) {
    if (!can('tenant.commissions.manage')) {
      return routeData({ error: 'Bạn không có quyền quản lý hoa hồng.' }, { status: 403 });
    }

    if (intent === 'delete-commission-rule') {
      const id = String(form.get('ruleId') ?? '');
      const res = await apiDelete(apiPaths.tenant.commissionRule(id), auth);
      if (!res.ok)
        return routeData({ error: res.error ?? 'Không xoá được quy tắc.' }, { status: 400 });
      return { ok: true, message: 'Đã xoá quy tắc riêng.' };
    }

    if (intent === 'create-commission-rule') {
      const parsed = createCommissionRuleInputSchema.safeParse(readCreateCommissionRule(form));
      if (!parsed.success) {
        return routeData({ error: 'Kiểm tra lại phạm vi và tỷ lệ hoa hồng.' }, { status: 400 });
      }
      const res = await apiPost(apiPaths.tenant.commissionRules, parsed.data, auth);
      if (!res.ok)
        return routeData({ error: res.error ?? 'Không tạo được quy tắc.' }, { status: 400 });
      return { ok: true, message: 'Đã thêm quy tắc hoa hồng.' };
    }

    const id = String(form.get('ruleId') ?? '');
    const parsed = updateCommissionRuleInputSchema.safeParse(readCommissionRatePatch(form));
    if (!parsed.success) {
      return routeData({ error: 'Kiểm tra lại tỷ lệ hoa hồng.' }, { status: 400 });
    }
    const res = await apiPatch(apiPaths.tenant.commissionRule(id), parsed.data, auth);
    if (!res.ok)
      return routeData({ error: res.error ?? 'Không cập nhật được quy tắc.' }, { status: 400 });
    return { ok: true, message: 'Đã cập nhật quy tắc hoa hồng.' };
  }

  if (!can('tenant.payouts.manage')) {
    return routeData({ error: 'Bạn không có quyền quản lý lệnh chi.' }, { status: 403 });
  }

  if (intent === 'create-payout') {
    const parsed = createPayoutInputSchema.safeParse({
      payeeType: form.get('payeeType'),
      payeeId: form.get('payeeId'),
    });
    if (!parsed.success) {
      return routeData({ error: 'Thông tin lệnh chi không hợp lệ.' }, { status: 400 });
    }
    const res = await apiPost(apiPaths.tenant.payouts, parsed.data, auth);
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
    const res = await apiPost(apiPaths.tenant.payoutMarkPaid(id), parsed.data, auth);
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
    const res = await apiPost(apiPaths.tenant.payoutFail(id), parsed.data, auth);
    if (!res.ok)
      return routeData({ error: res.error ?? 'Không cập nhật được lệnh chi.' }, { status: 400 });
    return { ok: true };
  }

  return routeData({ error: actionMessages.invalidIntent }, { status: 400 });
}

export default function TenantFinance({ loaderData, actionData }: Route.ComponentProps) {
  const {
    summary,
    payouts,
    payoutsTotal,
    partnerNames,
    canPayouts,
    canCommissions,
    commissionRules,
    commissionTargets,
    error,
  } = loaderData;
  const { readOnly } = useTenantArea();
  const [searchParams] = useSearchParams();
  const { page, pageSize, pageHref } = readListParams(searchParams);
  const actionError = actionData && 'error' in actionData ? actionData.error : null;
  const actionSuccess =
    actionData && 'message' in actionData && typeof actionData.message === 'string'
      ? actionData.message
      : null;

  const partnerBalances = summary?.partnerBalances ?? [];
  const affiliateBalances = summary?.affiliateBalances ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tài chính"
        description="Số dư công nợ, sổ cái và chi trả thủ công cho đối tác."
        actions={
          <>
            <Button asChild variant="outline">
              <Link to={dashboardPaths.tenant.settlements}>
                <ShieldCheck className="size-4" /> Tiền đang giữ
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to={dashboardPaths.tenant.ledger}>
                <BookText className="size-4" /> Xem sổ cái
              </Link>
            </Button>
            <Button asChild variant="outline">
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
      <SuccessBanner message={actionSuccess} />

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
          {canCommissions ? <TabsTrigger value="commissions">Hoa hồng</TabsTrigger> : null}
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

        {canCommissions ? (
          <TabsContent value="commissions" className="space-y-4">
            <CommissionRulesPanel
              rules={commissionRules}
              targets={commissionTargets}
              readOnly={readOnly}
            />
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}

function emptyCommissionTargets(): CommissionTargetOptions {
  return { partners: [], listingTypes: [], categories: [] };
}
