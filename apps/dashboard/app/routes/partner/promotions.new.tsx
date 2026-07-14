import { Link, redirect, data as routeData } from 'react-router';
import { createPartnerPromotionInputSchema, type ListingResponse } from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@booking/ui/components/ui/card';
import { Alert, AlertDescription } from '@booking/ui/components/ui/alert';
import { ArrowLeft, CircleAlert } from 'lucide-react';
import type { Route } from './+types/promotions.new';
import { apiGet, apiPost } from '~/lib/api.server';
import { requirePartner, canPartner } from './partner.server';
import { PageHeader } from './components/page-header';
import { PromotionForm, readPromotionForm } from '../tenant/components/promotion-form';
import type { ScopeOptions } from '../tenant/promotions/scope-options.server';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Tạo khuyến mãi · Đối tác · Bookify' }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { auth, membership } = await requirePartner(request);
  if (!canPartner(membership, 'partner.promotions.manage')) {
    throw new Response('Không có quyền.', { status: 403 });
  }
  const listings = await apiGet<ListingResponse[]>('/partner/listings', auth);
  const scopeOptions: ScopeOptions = {
    listings: (listings.ok ? (listings.data ?? []) : []).map((l) => ({ id: l.id, label: l.title })),
    listingTypes: [],
    listingGroups: [],
    partners: [],
  };
  return { scopeOptions, partnerId: membership.partnerId };
}

export async function action({ request }: Route.ActionArgs) {
  const { auth, membership } = await requirePartner(request);
  if (!canPartner(membership, 'partner.promotions.manage')) {
    throw new Response('Không có quyền.', { status: 403 });
  }
  const form = await request.formData();
  const parsed = createPartnerPromotionInputSchema.safeParse(readPromotionForm(form));
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return routeData({ error: first ? `${first.path.join('.')}: ${first.message}` : 'Dữ liệu không hợp lệ.' }, { status: 400 });
  }
  const res = await apiPost('/partner/promotions', parsed.data, auth);
  if (!res.ok) return routeData({ error: res.error ?? 'Không tạo được khuyến mãi.' }, { status: 400 });
  return redirect('/partner/promotions');
}

export default function NewPartnerPromotion({ loaderData, actionData }: Route.ComponentProps) {
  const error = actionData && 'error' in actionData ? actionData.error : null;
  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="w-fit">
        <Link to="/partner/promotions"><ArrowLeft className="size-4" /> Khuyến mãi</Link>
      </Button>
      <PageHeader title="Tạo khuyến mãi" description="Bạn tài trợ chi phí giảm giá cho listing của mình." />
      {error ? (
        <Alert variant="destructive"><CircleAlert className="size-4" /><AlertDescription>{error}</AlertDescription></Alert>
      ) : null}
      <Card>
        <CardHeader><CardTitle>Thông tin khuyến mãi</CardTitle></CardHeader>
        <CardContent>
          <PromotionForm
            mode="create"
            submitLabel="Tạo khuyến mãi"
            scopeOptions={loaderData.scopeOptions}
            scopeChoices={['partner', 'listing', 'listing_group']}
            restrictPartnerFunded
            selfPartnerId={loaderData.partnerId}
          />
        </CardContent>
      </Card>
    </div>
  );
}
