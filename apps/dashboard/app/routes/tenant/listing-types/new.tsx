import { data as routeData, Link, redirect } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { createListingTypeInputSchema } from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import type { Route } from './+types/new';
import { apiPost } from '~/lib/api.server';
import { requireTenant } from '../tenant.server';
import { PageHeader } from '~/components/page-header';
import { ListingTypeForm } from '../components/listing-type-form';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Loại dịch vụ mới · Tenant · Bookify' }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireTenant(request, 'tenant.listings.write');
  return null;
}

export async function action({ request }: Route.ActionArgs) {
  const { auth } = await requireTenant(request, 'tenant.listings.write');
  const parsed = createListingTypeInputSchema.safeParse(await request.json());
  if (!parsed.success) {
    return routeData({ error: null, fieldErrors: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const res = await apiPost('/tenant/listing-types', parsed.data, auth);
  if (!res.ok) {
    return routeData({ error: res.error ?? 'Tạo không thành công.', fieldErrors: res.errors ?? null }, { status: 400 });
  }
  return redirect('/tenant/listing-types');
}

export default function NewListingType({ actionData }: Route.ComponentProps) {
  return (
    <div className="space-y-5">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
          <Link to="/tenant/listing-types"><ArrowLeft className="size-4" /> Loại dịch vụ</Link>
        </Button>
        <PageHeader title="Loại dịch vụ mới" description="Tạo một loại dịch vụ với hình thức đặt và thuộc tính riêng." />
      </div>
      <ListingTypeForm serverError={actionData?.error ?? null} fieldErrors={actionData?.fieldErrors ?? null} />
    </div>
  );
}
