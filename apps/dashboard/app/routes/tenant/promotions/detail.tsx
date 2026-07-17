import { Link, redirect, useNavigation, useSubmit, data as routeData } from 'react-router';
import {
  updatePromotionInputSchema,
  type PromotionDetailResponse,
  type PromotionCategoryOption,
  type PromotionFundedByDto,
  type PromoUsageStatsResponse,
} from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@booking/ui/components/ui/card';
import { Alert, AlertDescription } from '@booking/ui/components/ui/alert';
import { Separator } from '@booking/ui/components/ui/separator';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@booking/ui/components/ui/alert-dialog';
import { DetailSection } from '@booking/ui/components/detail/detail-section';
import { DetailGrid } from '@booking/ui/components/detail/detail-grid';
import { DetailField } from '@booking/ui/components/detail/detail-field';
import { ArrowLeft, CircleAlert, Ban, TriangleAlert } from 'lucide-react';
import type { Route } from './+types/detail';
import { apiGet, apiPatch, apiPost } from '~/lib/api.server';
import { requireTenant } from '~/features/tenant/server/tenant.server';
import { formatDiscount, formatNumber } from '~/lib/format';
import { StatCard } from '~/components/stat-card';
import { Money } from '~/components/money';
import { DateTimeValue } from '~/components/date-time-value';
import { EnumValue } from '~/components/enum-value';
import { CopyableCode } from '~/components/copyable-code';
import { PromotionStatusBadge } from '~/components/status-badge';
import { PromotionForm, readPromotionForm, SCOPE_LABELS, TimeWindowsSummary } from '~/features/promotions/promotion-form';
import { loadScopeOptions } from '~/features/promotions/scope-options.server';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Chi tiết khuyến mãi · Tenant · Bookify' }];
}

const FUNDED_BY_LABELS: Record<PromotionFundedByDto, string> = {
  tenant: 'Cửa hàng',
  partner: 'Đối tác',
};

export async function loader({ request, params }: Route.LoaderArgs) {
  const { auth } = await requireTenant(request, 'tenant.promotions.manage');
  // Read-one endpoint (not list+find) — survives pagination, and resolves the display
  // names (funding/creator partner, scope target) that the list response omits.
  const [promoRes, statsRes, scopeOptions, categoriesRes] = await Promise.all([
    apiGet<PromotionDetailResponse>(`/tenant/promotions/${params.promotionId}`, auth),
    apiGet<PromoUsageStatsResponse>(`/tenant/promotions/${params.promotionId}/usage-stats`, auth),
    loadScopeOptions(auth),
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
    const first = parsed.error.issues[0];
    return routeData({ error: first ? `${first.path.join('.')}: ${first.message}` : 'Dữ liệu không hợp lệ.' }, { status: 400 });
  }
  const res = await apiPatch(`/tenant/promotions/${id}`, parsed.data, auth);
  if (!res.ok) return routeData({ error: res.error ?? 'Không cập nhật được khuyến mãi.' }, { status: 400 });
  return redirect('/tenant/promotions');
}

export default function PromotionDetail({ loaderData, actionData }: Route.ComponentProps) {
  const { promotion, stats, scopeOptions, categoryOptions } = loaderData;
  const error = actionData && 'error' in actionData ? actionData.error : null;
  const nav = useNavigation();
  const ended = promotion.status === 'ended';
  const partnerFundedPending = promotion.fundedBy === 'partner' && promotion.partnerOptInAt == null;

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="w-fit">
        <Link to="/tenant/promotions"><ArrowLeft className="size-4" /> Khuyến mãi</Link>
      </Button>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">{promotion.name}</h1>
          {promotion.code ? (
            <CopyableCode value={promotion.code} label="mã khuyến mãi" />
          ) : (
            <p className="text-sm text-muted-foreground">Tự động áp dụng — không cần mã.</p>
          )}
        </div>
        <PromotionStatusBadge status={promotion.status} />
      </div>

      {error ? (
        <Alert variant="destructive"><CircleAlert className="size-4" /><AlertDescription>{error}</AlertDescription></Alert>
      ) : null}

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
          <DetailSection title="Tóm tắt" description="Điều kiện áp dụng của khuyến mãi.">
            <DetailGrid>
              <DetailField
                label="Giảm giá"
                emphasis="strong"
                value={formatDiscount(promotion.discountType, promotion.discountValue)}
                hint={
                  promotion.discountType === 'percent'
                    ? promotion.maxDiscount
                      ? <>Tối đa <Money value={promotion.maxDiscount} /></>
                      : 'Không giới hạn mức giảm'
                    : undefined
                }
              />
              <DetailField
                label="Phạm vi"
                value={
                  <span>
                    <EnumValue map={SCOPE_LABELS} value={promotion.appliesTo} />
                    {promotion.appliesToLabel ? (
                      <span className="text-muted-foreground"> · {promotion.appliesToLabel}</span>
                    ) : null}
                  </span>
                }
              />
              <DetailField
                label="Thời gian áp dụng"
                value={
                  promotion.startsAt || promotion.endsAt ? (
                    <span className="inline-flex items-center gap-1.5">
                      <DateTimeValue iso={promotion.startsAt} />
                      <span className="text-muted-foreground">→</span>
                      <DateTimeValue iso={promotion.endsAt} />
                    </span>
                  ) : (
                    'Không giới hạn thời gian'
                  )
                }
              />
              <DetailField
                label="Đơn tối thiểu"
                value={promotion.minOrderAmount ? <Money value={promotion.minOrderAmount} /> : 'Không yêu cầu'}
              />
              <DetailField
                label="Giới hạn tổng lượt"
                value={promotion.usageLimitTotal != null ? formatNumber(promotion.usageLimitTotal) : 'Không giới hạn'}
              />
              <DetailField
                label="Giới hạn mỗi khách"
                value={promotion.usageLimitPerCustomer != null ? formatNumber(promotion.usageLimitPerCustomer) : 'Không giới hạn'}
              />
              <DetailField label="Chỉ lần đặt đầu tiên" value={promotion.firstBookingOnly ? 'Có' : 'Không'} />
              <DetailField label="Ngày tạo" value={<DateTimeValue iso={promotion.createdAt} relative />} />
              <DetailField
                label="Khung giờ ưu đãi (off-peak)"
                span={2}
                value={<TimeWindowsSummary windows={promotion.timeWindows} />}
              />
            </DetailGrid>
          </DetailSection>

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
        <Card>
          <CardHeader>
            <CardTitle>Chỉnh sửa</CardTitle>
            <CardDescription>Cập nhật điều kiện áp dụng.</CardDescription>
          </CardHeader>
          <CardContent>
            <PromotionForm
              mode="edit"
              promotion={promotion}
              submitLabel="Lưu thay đổi"
              scopeOptions={scopeOptions}
              categoryOptions={categoryOptions}
            />
          </CardContent>
        </Card>
      ) : null}

      {/* Section 6 — Danger zone, behind a confirmation dialog (irreversible). */}
      {!ended ? (
        <Card>
          <CardHeader>
            <CardTitle>Kết thúc khuyến mãi</CardTitle>
            <CardDescription>Ngừng vĩnh viễn — khách hàng sẽ không thể dùng mã này nữa.</CardDescription>
          </CardHeader>
          <CardContent>
            <EndPromotionDialog busy={nav.state !== 'idle'} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

/** "Kết thúc" gated behind an AlertDialog, submitting the `end` intent to the route action. */
function EndPromotionDialog({ busy }: { busy: boolean }) {
  const submit = useSubmit();
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" disabled={busy}>
          <Ban className="size-4" /> Kết thúc khuyến mãi
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Kết thúc khuyến mãi?</AlertDialogTitle>
          <AlertDialogDescription>
            Thao tác này không thể hoàn tác — mã sẽ ngừng vĩnh viễn và khách hàng không thể dùng nữa.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Huỷ</AlertDialogCancel>
          <AlertDialogAction disabled={busy} onClick={() => submit({ intent: 'end' }, { method: 'post' })}>
            Kết thúc
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
