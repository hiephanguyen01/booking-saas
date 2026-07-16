import { Link, redirect, useNavigation, useSubmit, data as routeData } from 'react-router';
import {
  updatePartnerPromotionInputSchema,
  type ListingGroupResponse,
  type ListingResponse,
  type PromotionDetailResponse,
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
import { ArrowLeft, Ban, CircleAlert } from 'lucide-react';
import type { Route } from './+types/promotions.$promotionId';
import { apiGet, apiPatch, apiPost } from '~/lib/api.server';
import { requirePartner, canPartner } from './partner.server';
import { formatDiscount, formatNumber } from '~/lib/format';
import { StatCard } from '~/components/stat-card';
import { Money } from '~/components/money';
import { DateTimeValue } from '~/components/date-time-value';
import { EnumValue } from '~/components/enum-value';
import { CopyableCode } from '~/components/copyable-code';
import { PromotionStatusBadge } from '~/components/status-badge';
import {
  PromotionForm,
  readPromotionForm,
  SCOPE_LABELS,
  TimeWindowsSummary,
} from '../tenant/components/promotion-form';
import type { ScopeOptions } from '../tenant/promotions/scope-options.server';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Chi tiết khuyến mãi · Đối tác · Bookify' }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { auth, membership } = await requirePartner(request);
  if (!canPartner(membership, 'partner.promotions.manage')) {
    throw new Response('Không có quyền.', { status: 403 });
  }
  // Read-one endpoint — survives pagination and carries the resolved display names.
  const [promoRes, listings, groups] = await Promise.all([
    apiGet<PromotionDetailResponse>(`/partner/promotions/${params.promotionId}`, auth),
    apiGet<ListingResponse[]>('/partner/listings', auth),
    apiGet<ListingGroupResponse[]>('/partner/listing-groups', auth),
  ]);
  if (!promoRes.ok || !promoRes.data) throw new Response('Không tìm thấy khuyến mãi', { status: 404 });
  const scopeOptions: ScopeOptions = {
    listings: (listings.ok ? (listings.data ?? []) : []).map((l) => ({ id: l.id, label: l.title })),
    listingTypes: [],
    // Populate the `listing_group` scope the form offers (was hardcoded empty before).
    listingGroups: (groups.ok ? (groups.data ?? []) : []).map((g) => ({ id: g.id, label: g.title })),
    partners: [],
  };
  return { promotion: promoRes.data, scopeOptions, partnerId: membership.partnerId };
}

export async function action({ request, params }: Route.ActionArgs) {
  const { auth, membership } = await requirePartner(request);
  if (!canPartner(membership, 'partner.promotions.manage')) {
    throw new Response('Không có quyền.', { status: 403 });
  }
  const form = await request.formData();
  const id = params.promotionId;
  if (String(form.get('intent')) === 'end') {
    const res = await apiPost(`/partner/promotions/${id}/end`, {}, auth);
    if (!res.ok) return routeData({ error: res.error ?? 'Không kết thúc được.' }, { status: 400 });
    return redirect('/partner/promotions');
  }
  const parsed = updatePartnerPromotionInputSchema.safeParse(readPromotionForm(form));
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return routeData({ error: first ? `${first.path.join('.')}: ${first.message}` : 'Dữ liệu không hợp lệ.' }, { status: 400 });
  }
  const res = await apiPatch(`/partner/promotions/${id}`, parsed.data, auth);
  if (!res.ok) return routeData({ error: res.error ?? 'Không cập nhật được.' }, { status: 400 });
  return redirect('/partner/promotions');
}

export default function PartnerPromotionDetail({ loaderData, actionData }: Route.ComponentProps) {
  const { promotion, scopeOptions, partnerId } = loaderData;
  const error = actionData && 'error' in actionData ? actionData.error : null;
  const nav = useNavigation();
  const ended = promotion.status === 'ended';

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="w-fit">
        <Link to="/partner/promotions"><ArrowLeft className="size-4" /> Khuyến mãi</Link>
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

      {/* Read-only facts — kept rendered even for an ended promo. */}
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

          <DetailSection title="Tài trợ" description="Bạn tài trợ chi phí giảm giá cho khuyến mãi này.">
            <DetailGrid>
              <DetailField label="Đối tác tài trợ" value={promotion.fundingPartnerName ?? undefined} />
              <DetailField
                label="Bạn đã đồng ý (opt-in)"
                value={promotion.partnerOptInAt ? <DateTimeValue iso={promotion.partnerOptInAt} relative /> : undefined}
                hint={promotion.partnerOptInAt == null ? 'Chưa đồng ý tài trợ' : undefined}
              />
              <DetailField label="Đối tác tạo mã" value={promotion.createdByPartnerName ?? undefined} />
            </DetailGrid>
          </DetailSection>
        </CardContent>
      </Card>

      {/* Hiệu quả — the partner surface has no usage-stats endpoint, so only the
          redemption counter from the detail response is available here. */}
      <DetailSection title="Hiệu quả" description="Số lượt khách đã dùng mã.">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard
            label="Đã dùng"
            value={formatNumber(promotion.redeemedCount)}
            hint={promotion.usageLimitTotal != null ? `Giới hạn ${formatNumber(promotion.usageLimitTotal)}` : 'Không giới hạn'}
          />
        </div>
      </DetailSection>

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
              scopeChoices={['partner', 'listing', 'listing_group']}
              restrictPartnerFunded
              selfPartnerId={partnerId}
            />
          </CardContent>
        </Card>
      ) : null}

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
