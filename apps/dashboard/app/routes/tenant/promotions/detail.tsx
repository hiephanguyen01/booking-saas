import { redirect, data as routeData } from 'react-router';
import {
  updatePromotionInputSchema,
  type PromotionDetailResponse,
  type PromotionCategoryOption,
  type PromoUsageStatsResponse,
} from '@booking/contracts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@booking/ui/components/ui/card';
import { Alert, AlertDescription } from '@booking/ui/components/ui/alert';
import { Separator } from '@booking/ui/components/ui/separator';
import { DetailSection } from '@booking/ui/components/detail/detail-section';
import { DetailGrid } from '@booking/ui/components/detail/detail-grid';
import { DetailField } from '@booking/ui/components/detail/detail-field';
import { CircleAlert, TriangleAlert } from 'lucide-react';
import type { Route } from './+types/detail';
import { apiGet, apiPatch, apiPost } from '~/lib/api.server';
import { requireTenant } from '~/features/tenant/server/tenant.server';
import { formatNumber } from '~/lib/format';
import { StatCard } from '~/components/stat-card';
import { Money } from '~/components/money';
import { DateTimeValue } from '~/components/date-time-value';
import { EnumValue } from '~/components/enum-value';
import { ErrorBanner } from '~/components/action-feedback';
import { BackLink } from '~/components/back-link';
import { useBusy } from '~/hooks/use-busy';
import { PromotionForm } from '~/features/promotions/components/promotion-form';
import {
  readPromotionForm,
  zodFirstIssueMessage,
} from '~/features/promotions/server/promotion-form.server';
import { PromotionHeader } from '~/features/promotions/components/promotion-header';
import { PromotionSummarySection } from '~/features/promotions/components/promotion-summary-section';
import { EndPromotionDialog } from '~/features/promotions/components/end-promotion-dialog';
import { FUNDED_BY_LABELS } from '~/constants/promotion';
import { loadTenantScopeOptions } from '~/features/promotions/server/scope-options.server';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Chi tiết khuyến mãi · Tenant · BookingOS' }];
}


export async function loader({ request, params }: Route.LoaderArgs) {
  const { auth } = await requireTenant(request, 'tenant.promotions.manage');
  // Read-one endpoint (not list+find) — survives pagination, and resolves the display
  // names (funding/creator partner, scope target) that the list response omits.
  const [promoRes, statsRes, scopeOptions, categoriesRes] = await Promise.all([
    apiGet<PromotionDetailResponse>(`/tenant/promotions/${params.promotionId}`, auth),
    apiGet<PromoUsageStatsResponse>(`/tenant/promotions/${params.promotionId}/usage-stats`, auth),
    loadTenantScopeOptions(auth),
    apiGet<PromotionCategoryOption[]>('/tenant/promotions/categories', auth),
  ]);
  if (!promoRes.ok || !promoRes.data) throw new Response('Không tìm thấy khuyến mãi', { status: 404 });
  const categoryOptions = (categoriesRes.ok ? (categoriesRes.data ?? []) : []).map((c) => ({
    id: c.id,
    label: c.name,
  }));
  return {
    promotion: promoRes.data,
    // Stats can fail independently — render the tiles' failed state, never 500 the page.
    stats: statsRes.ok ? statsRes.data : null,
    scopeOptions,
    categoryOptions,
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  const { auth } = await requireTenant(request, 'tenant.promotions.manage');
  const form = await request.formData();
  const intent = String(form.get('intent'));
  const id = params.promotionId;

  if (intent === 'end') {
    const res = await apiPost(`/tenant/promotions/${id}/end`, {}, auth);
    if (!res.ok) return routeData({ error: res.error ?? 'Không kết thúc được khuyến mãi.' }, { status: 400 });
    return redirect('/tenant/promotions');
  }

  const parsed = updatePromotionInputSchema.safeParse(readPromotionForm(form));
  if (!parsed.success) {
    return routeData({ error: zodFirstIssueMessage(parsed.error) }, { status: 400 });
  }
  const res = await apiPatch(`/tenant/promotions/${id}`, parsed.data, auth);
  if (!res.ok) return routeData({ error: res.error ?? 'Không cập nhật được khuyến mãi.' }, { status: 400 });
  return redirect('/tenant/promotions');
}

export default function PromotionDetail({ loaderData, actionData }: Route.ComponentProps) {
  const { promotion, stats, scopeOptions, categoryOptions } = loaderData;
  const error = actionData && 'error' in actionData ? actionData.error : null;
  const busy = useBusy();
  const ended = promotion.status === 'ended';
  const partnerFundedPending = promotion.fundedBy === 'partner' && promotion.partnerOptInAt == null;

  return (
    <div className="space-y-6">
      <BackLink to="/tenant/promotions" label="Khuyến mãi" />

      <PromotionHeader promotion={promotion} />

      <ErrorBanner error={error} />

      {partnerFundedPending ? (
        <Alert>
          <CircleAlert className="size-4" />
          <AlertDescription>
            Khuyến mãi do đối tác tài trợ — <strong>chưa có hiệu lực</strong> cho tới khi đối tác đồng ý (opt-in).
          </AlertDescription>
        </Alert>
      ) : null}

      {/* Section 2 + 3 — read-only facts. Kept rendered even for an ended promo. */}
      <Card>
        <CardContent className="space-y-6 pt-6">
          <PromotionSummarySection promotion={promotion} />

          <Separator />

          <DetailSection title="Tài trợ" description="Bên chịu chi phí giảm giá và trạng thái đồng ý của đối tác.">
            <DetailGrid>
              <DetailField label="Bên chịu chi phí" value={<EnumValue map={FUNDED_BY_LABELS} value={promotion.fundedBy} />} />
              <DetailField label="Đối tác tài trợ" value={promotion.fundingPartnerName ?? undefined} />
              <DetailField
                label="Đối tác đồng ý (opt-in)"
                value={promotion.partnerOptInAt ? <DateTimeValue iso={promotion.partnerOptInAt} relative /> : undefined}
                hint={promotion.fundedBy === 'partner' && promotion.partnerOptInAt == null ? 'Đang chờ đối tác đồng ý' : undefined}
              />
              <DetailField label="Đối tác tạo mã" value={promotion.createdByPartnerName ?? undefined} />
            </DetailGrid>
          </DetailSection>
        </CardContent>
      </Card>

      {/* Section 4 — Hiệu quả. Kept rendered even for an ended promo (post-mortem). */}
      <DetailSection title="Hiệu quả" description="Số liệu sử dụng của mã khuyến mãi.">
        {stats ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <StatCard label="Đã áp dụng" value={formatNumber(stats.appliedCount)} />
            <StatCard label="Đang giữ chỗ" value={formatNumber(stats.reservedCount)} tone="muted" />
            <StatCard label="Đã nhả lại" value={formatNumber(stats.releasedCount)} tone="muted" hint="Giữ chỗ đã huỷ" />
            <StatCard
              label="Đã dùng"
              value={formatNumber(stats.redeemedCount)}
              hint={stats.usageLimitTotal != null ? `Giới hạn ${formatNumber(stats.usageLimitTotal)}` : 'Không giới hạn'}
            />
            <StatCard label="Tổng giảm giá" value={<Money value={stats.totalDiscount} />} tone="positive" />
          </div>
        ) : (
          <p className="inline-flex items-center gap-1.5 text-sm text-warning">
            <TriangleAlert className="size-4 shrink-0" aria-hidden /> Không tải được số liệu sử dụng.
          </p>
        )}
      </DetailSection>

      {/* Section 5 — Edit. An ended promo can no longer be edited. */}
      {!ended ? (
        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Chỉnh sửa khuyến mãi</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Cập nhật mức ưu đãi, điều kiện và lịch chạy.
            </p>
          </div>
          <PromotionForm
            mode="edit"
            promotion={promotion}
            submitLabel="Lưu thay đổi"
            scopeOptions={scopeOptions}
            categoryOptions={categoryOptions}
          />
        </section>
      ) : null}

      {/* Section 6 — Danger zone, behind a confirmation dialog (irreversible). */}
      {!ended ? (
        <Card>
          <CardHeader>
            <CardTitle>Kết thúc khuyến mãi</CardTitle>
            <CardDescription>Ngừng vĩnh viễn — khách hàng sẽ không thể dùng mã này nữa.</CardDescription>
          </CardHeader>
          <CardContent>
            <EndPromotionDialog busy={busy} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
