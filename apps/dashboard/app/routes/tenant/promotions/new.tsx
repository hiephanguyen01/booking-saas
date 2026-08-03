import { redirect, data as routeData } from 'react-router';
import { createPromotionInputSchema, type PromotionCategoryOption } from '@booking/contracts';
import type { Route } from './+types/new';
import { apiGet, apiPost } from '~/lib/api.server';
import { requireTenant } from '~/features/tenant/server/tenant.server';
import { ErrorBanner } from '~/components/action-feedback';
import { FormPage } from '~/components/form-page';
import { dashboardPaths } from '~/constants/paths';
import { PromotionForm } from '~/features/promotions/components/promotion-form';
import {
  readPromotionForm,
  zodFirstIssueMessage,
} from '~/features/promotions/server/promotion-form.server';
import { loadTenantScopeOptions } from '~/features/promotions/server/scope-options.server';
import { apiPaths } from '~/constants/api-paths';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Tạo khuyến mãi · Tenant · BookingOS' }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { auth } = await requireTenant(request, 'tenant.promotions.manage');
  const [scopeOptions, categoriesRes] = await Promise.all([
    loadTenantScopeOptions(auth),
    apiGet<PromotionCategoryOption[]>(apiPaths.tenant.promotionCategories, auth),
  ]);
  const categoryOptions = (categoriesRes.ok ? (categoriesRes.data ?? []) : []).map((c) => ({
    id: c.id,
    label: c.name,
  }));
  return { scopeOptions, categoryOptions };
}

export async function action({ request }: Route.ActionArgs) {
  const { auth } = await requireTenant(request, 'tenant.promotions.manage');
  const form = await request.formData();
  const parsed = createPromotionInputSchema.safeParse(readPromotionForm(form));
  if (!parsed.success) {
    return routeData({ error: zodFirstIssueMessage(parsed.error) }, { status: 400 });
  }
  const res = await apiPost(apiPaths.tenant.promotions, parsed.data, auth);
  if (!res.ok) return routeData({ error: res.error ?? 'Không tạo được khuyến mãi.' }, { status: 400 });
  return redirect(dashboardPaths.tenant.promotions);
}

export default function NewPromotion({ loaderData, actionData }: Route.ComponentProps) {
  const error = actionData && 'error' in actionData ? actionData.error : null;
  return (
    <FormPage
      backTo={dashboardPaths.tenant.promotions}
      backLabel="Khuyến mãi"
      title="Tạo khuyến mãi"
      description="Thiết lập ưu đãi, phạm vi áp dụng và thời gian chạy trong một luồng duy nhất."
      banner={<ErrorBanner error={error} />}
    >
      <PromotionForm
        mode="create"
        submitLabel="Tạo khuyến mãi"
        scopeOptions={loaderData.scopeOptions}
        categoryOptions={loaderData.categoryOptions}
      />
    </FormPage>
  );
}
