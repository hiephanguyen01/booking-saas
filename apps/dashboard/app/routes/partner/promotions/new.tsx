import { redirect, data as routeData } from 'react-router';
import { createPartnerPromotionInputSchema } from '@booking/contracts';
import { Card, CardContent, CardHeader, CardTitle } from '@booking/ui/components/ui/card';
import type { Route } from './+types/new';
import { apiPost } from '~/lib/api.server';
import { requirePartner } from '~/features/partner/server/partner.server';
import { ErrorBanner } from '~/components/action-feedback';
import { BackLink } from '~/components/back-link';
import { PageHeader } from '~/components/page-header';
import { PromotionForm } from '~/features/promotions/promotion-form';
import {
  readPromotionForm,
  zodFirstIssueMessage,
} from '~/features/promotions/promotion-form.server';
import { loadPartnerScopeOptions } from '~/features/promotions/scope-options.server';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Tạo khuyến mãi · Đối tác · Bookify' }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { auth, membership } = await requirePartner(request, 'partner.promotions.manage');
  const scopeOptions = await loadPartnerScopeOptions(auth);
  return { scopeOptions, partnerId: membership.partnerId };
}

export async function action({ request }: Route.ActionArgs) {
  const { auth } = await requirePartner(request, 'partner.promotions.manage');
  const form = await request.formData();
  const parsed = createPartnerPromotionInputSchema.safeParse(readPromotionForm(form));
  if (!parsed.success) {
    return routeData({ error: zodFirstIssueMessage(parsed.error) }, { status: 400 });
  }
  const res = await apiPost('/partner/promotions', parsed.data, auth);
  if (!res.ok) return routeData({ error: res.error ?? 'Không tạo được khuyến mãi.' }, { status: 400 });
  return redirect('/partner/promotions');
}

export default function NewPartnerPromotion({ loaderData, actionData }: Route.ComponentProps) {
  const error = actionData && 'error' in actionData ? actionData.error : null;
  return (
    <div className="space-y-6">
      <BackLink to="/partner/promotions" label="Khuyến mãi" />
      <PageHeader title="Tạo khuyến mãi" description="Bạn tài trợ chi phí giảm giá cho listing của mình." />
      <ErrorBanner error={error} />
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
