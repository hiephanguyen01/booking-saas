import { redirect, data as routeData } from 'react-router';
import {
  updatePartnerPromotionInputSchema,
  type PromotionDetailResponse,
} from '@booking/contracts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@booking/ui/components/ui/card';
import { Separator } from '@booking/ui/components/ui/separator';
import { DetailSection } from '@booking/ui/components/detail/detail-section';
import { DetailGrid } from '@booking/ui/components/detail/detail-grid';
import { DetailField } from '@booking/ui/components/detail/detail-field';
import type { Route } from './+types/detail';
import { apiGet, apiPatch, apiPost } from '~/lib/api.server';
import { requirePartner } from '~/features/partner/server/partner.server';
import { formatNumber } from '~/lib/format';
import { StatCard } from '~/components/stat-card';
import { DateTimeValue } from '~/components/date-time-value';
import { ErrorBanner } from '~/components/action-feedback';
import { BackLink } from '~/components/back-link';
import { useBusy } from '~/hooks/use-busy';
import { PromotionForm } from '~/features/promotions/promotion-form';
import {
  readPromotionForm,
  zodFirstIssueMessage,
} from '~/features/promotions/promotion-form.server';
import { PromotionHeader } from '~/features/promotions/promotion-header';
import { PromotionSummarySection } from '~/features/promotions/promotion-summary-section';
import { EndPromotionDialog } from '~/features/promotions/end-promotion-dialog';
import { loadPartnerScopeOptions } from '~/features/promotions/scope-options.server';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Chi tiết khuyến mãi · Đối tác · Bookify' }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { auth, membership } = await requirePartner(request, 'partner.promotions.manage');
  // Read-one endpoint — survives pagination and carries the resolved display names.
  const [promoRes, scopeOptions] = await Promise.all([
    apiGet<PromotionDetailResponse>(`/partner/promotions/${params.promotionId}`, auth),
    loadPartnerScopeOptions(auth),
  ]);
  if (!promoRes.ok || !promoRes.data) throw new Response('Không tìm thấy khuyến mãi', { status: 404 });
  return { promotion: promoRes.data, scopeOptions, partnerId: membership.partnerId };
}

export async function action({ request, params }: Route.ActionArgs) {
  const { auth } = await requirePartner(request, 'partner.promotions.manage');
  const form = await request.formData();
  const id = params.promotionId;
  if (String(form.get('intent')) === 'end') {
    const res = await apiPost(`/partner/promotions/${id}/end`, {}, auth);
    if (!res.ok) return routeData({ error: res.error ?? 'Không kết thúc được.' }, { status: 400 });
    return redirect('/partner/promotions');
  }
  const parsed = updatePartnerPromotionInputSchema.safeParse(readPromotionForm(form));
  if (!parsed.success) {
    return routeData({ error: zodFirstIssueMessage(parsed.error) }, { status: 400 });
  }
  const res = await apiPatch(`/partner/promotions/${id}`, parsed.data, auth);
  if (!res.ok) return routeData({ error: res.error ?? 'Không cập nhật được.' }, { status: 400 });
  return redirect('/partner/promotions');
}

export default function PartnerPromotionDetail({ loaderData, actionData }: Route.ComponentProps) {
  const { promotion, scopeOptions, partnerId } = loaderData;
  const error = actionData && 'error' in actionData ? actionData.error : null;
  const busy = useBusy();
  const ended = promotion.status === 'ended';

  return (
    <div className="space-y-6">
      <BackLink to="/partner/promotions" label="Khuyến mãi" />

      <PromotionHeader promotion={promotion} />

      <ErrorBanner error={error} />

      {/* Read-only facts — kept rendered even for an ended promo. */}
      <Card>
        <CardContent className="space-y-6 pt-6">
          <PromotionSummarySection promotion={promotion} />

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
            <EndPromotionDialog busy={busy} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
