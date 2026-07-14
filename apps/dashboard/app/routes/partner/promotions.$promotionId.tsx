import { Form, Link, redirect, useNavigation, data as routeData } from 'react-router';
import { updatePartnerPromotionInputSchema, type ListingResponse, type PromotionResponse } from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@booking/ui/components/ui/card';
import { Alert, AlertDescription } from '@booking/ui/components/ui/alert';
import { ArrowLeft, Ban, CircleAlert } from 'lucide-react';
import type { Route } from './+types/promotions.$promotionId';
import { apiGet, apiPatch, apiPost } from '~/lib/api.server';
import { requirePartner, canPartner } from './partner.server';
import { PageHeader } from './components/page-header';
import { PromotionForm, readPromotionForm } from '../tenant/components/promotion-form';
import type { ScopeOptions } from '../tenant/promotions/scope-options.server';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Chi tiết khuyến mãi · Đối tác · Bookify' }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { auth, membership } = await requirePartner(request);
  if (!canPartner(membership, 'partner.promotions.manage')) {
    throw new Response('Không có quyền.', { status: 403 });
  }
  const [listRes, listings] = await Promise.all([
    apiGet<PromotionResponse[]>('/partner/promotions', auth),
    apiGet<ListingResponse[]>('/partner/listings', auth),
  ]);
  const promotion = listRes.ok ? (listRes.data ?? []).find((p) => p.id === params.promotionId) : null;
  if (!promotion) throw new Response('Không tìm thấy khuyến mãi', { status: 404 });
  const scopeOptions: ScopeOptions = {
    listings: (listings.ok ? (listings.data ?? []) : []).map((l) => ({ id: l.id, label: l.title })),
    listingTypes: [],
    listingGroups: [],
    partners: [],
  };
  return { promotion, scopeOptions, partnerId: membership.partnerId };
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
      <PageHeader title={promotion.name} description={promotion.code ?? 'Tự động áp dụng'} />

      {error ? (
        <Alert variant="destructive"><CircleAlert className="size-4" /><AlertDescription>{error}</AlertDescription></Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Chỉnh sửa</CardTitle>
          <CardDescription>{ended ? 'Khuyến mãi đã kết thúc và không thể chỉnh sửa.' : 'Cập nhật điều kiện áp dụng.'}</CardDescription>
        </CardHeader>
        <CardContent>
          {ended ? (
            <p className="text-sm text-muted-foreground">Không còn thao tác nào khả dụng.</p>
          ) : (
            <PromotionForm
              mode="edit"
              promotion={promotion}
              submitLabel="Lưu thay đổi"
              scopeOptions={scopeOptions}
              scopeChoices={['partner', 'listing', 'listing_group']}
              restrictPartnerFunded
              selfPartnerId={partnerId}
            />
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
