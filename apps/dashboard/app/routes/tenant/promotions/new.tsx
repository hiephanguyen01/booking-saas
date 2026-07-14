import { Link, redirect, data as routeData } from 'react-router';
import { createPromotionInputSchema } from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@booking/ui/components/ui/card';
import { Alert, AlertDescription } from '@booking/ui/components/ui/alert';
import { ArrowLeft, CircleAlert } from 'lucide-react';
import type { Route } from './+types/new';
import { apiPost } from '~/lib/api.server';
import { requireTenant } from '../tenant.server';
import { PageHeader } from '../components/page';
import { PromotionForm, readPromotionForm } from '../components/promotion-form';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Tạo khuyến mãi · Tenant · Bookify' }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireTenant(request, 'tenant.promotions.manage');
  return null;
}

export async function action({ request }: Route.ActionArgs) {
  const { auth } = await requireTenant(request, 'tenant.promotions.manage');
  const form = await request.formData();
  const parsed = createPromotionInputSchema.safeParse(readPromotionForm(form));
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return routeData({ error: first ? `${first.path.join('.')}: ${first.message}` : 'Dữ liệu không hợp lệ.' }, { status: 400 });
  }
  const res = await apiPost('/tenant/promotions', parsed.data, auth);
  if (!res.ok) return routeData({ error: res.error ?? 'Không tạo được khuyến mãi.' }, { status: 400 });
  return redirect('/tenant/promotions');
}

export default function NewPromotion({ actionData }: Route.ComponentProps) {
  const error = actionData && 'error' in actionData ? actionData.error : null;
  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="w-fit">
        <Link to="/tenant/promotions"><ArrowLeft className="size-4" /> Khuyến mãi</Link>
      </Button>
      <PageHeader title="Tạo mã khuyến mãi" description="Thiết lập điều kiện và giá trị giảm giá." />
      {error ? (
        <Alert variant="destructive"><CircleAlert className="size-4" /><AlertDescription>{error}</AlertDescription></Alert>
      ) : null}
      <Card>
        <CardHeader><CardTitle>Thông tin khuyến mãi</CardTitle></CardHeader>
        <CardContent>
          <PromotionForm mode="create" submitLabel="Tạo khuyến mãi" />
        </CardContent>
      </Card>
    </div>
  );
}
