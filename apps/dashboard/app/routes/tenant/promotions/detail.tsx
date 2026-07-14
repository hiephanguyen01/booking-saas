import { Form, Link, redirect, useNavigation, data as routeData } from 'react-router';
import {
  updatePromotionInputSchema,
  type PromotionResponse,
  type PromoUsageStatsResponse,
} from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@booking/ui/components/ui/card';
import { Alert, AlertDescription } from '@booking/ui/components/ui/alert';
import { ArrowLeft, CircleAlert, Ban } from 'lucide-react';
import type { Route } from './+types/detail';
import { apiGet, apiPatch, apiPost } from '~/lib/api.server';
import { requireTenant } from '../tenant.server';
import { formatVnd } from '../format';
import { PageHeader, StatCard } from '../components/page';
import { PromotionStatusBadge } from '../components/status';
import { PromotionForm, readPromotionForm } from '../components/promotion-form';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Chi tiết khuyến mãi · Tenant · Bookify' }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { auth } = await requireTenant(request, 'tenant.promotions.manage');
  const [listRes, statsRes] = await Promise.all([
    apiGet<PromotionResponse[]>('/tenant/promotions', auth),
    apiGet<PromoUsageStatsResponse>(`/tenant/promotions/${params.promotionId}/usage-stats`, auth),
  ]);
  const promotion = listRes.ok ? (listRes.data ?? []).find((p) => p.id === params.promotionId) : null;
  if (!promotion) throw new Response('Không tìm thấy khuyến mãi', { status: 404 });
  return { promotion, stats: statsRes.ok ? statsRes.data : null };
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
  const { promotion, stats } = loaderData;
  const error = actionData && 'error' in actionData ? actionData.error : null;
  const nav = useNavigation();
  const ended = promotion.status === 'ended';

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="w-fit">
        <Link to="/tenant/promotions"><ArrowLeft className="size-4" /> Khuyến mãi</Link>
      </Button>

      <PageHeader
        title={promotion.name}
        description={promotion.code ?? undefined}
        actions={<PromotionStatusBadge status={promotion.status} />}
      />

      {error ? (
        <Alert variant="destructive"><CircleAlert className="size-4" /><AlertDescription>{error}</AlertDescription></Alert>
      ) : null}

      {stats ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Đã áp dụng" value={stats.appliedCount} />
          <StatCard label="Đang giữ chỗ" value={stats.reservedCount} tone="muted" />
          <StatCard label="Tổng lượt dùng" value={stats.redeemedCount} hint={stats.usageLimitTotal ? `Giới hạn ${stats.usageLimitTotal}` : 'Không giới hạn'} />
          <StatCard label="Tổng giảm giá" value={formatVnd(stats.totalDiscount)} tone="positive" />
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Chỉnh sửa</CardTitle>
          <CardDescription>
            {ended ? 'Khuyến mãi đã kết thúc và không thể chỉnh sửa.' : 'Cập nhật điều kiện áp dụng.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {ended ? (
            <p className="text-sm text-muted-foreground">Không còn thao tác nào khả dụng.</p>
          ) : (
            <PromotionForm mode="edit" promotion={promotion} submitLabel="Lưu thay đổi" />
          )}
        </CardContent>
      </Card>

      {!ended ? (
        <Card>
          <CardHeader>
            <CardTitle>Kết thúc khuyến mãi</CardTitle>
            <CardDescription>Ngừng vĩnh viễn — khách hàng sẽ không thể dùng mã này nữa.</CardDescription>
          </CardHeader>
          <CardContent>
            <Form method="post">
              <input type="hidden" name="intent" value="end" />
              <Button type="submit" variant="destructive" disabled={nav.state !== 'idle'}>
                <Ban className="size-4" /> Kết thúc khuyến mãi
              </Button>
            </Form>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
