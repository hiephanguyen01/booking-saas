import { data as routeData, Link, redirect } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { updateListingTypeInputSchema, type ListingTypeResponse } from '@booking/shared';
import { Button } from '@booking/ui/components/ui/button';
import type { Route } from './+types/edit';
import { apiGet, apiPatch } from '~/lib/api.server';
import { requireTenant } from '../tenant.server';
import { PageHeader } from '../components/page';
import { ListingTypeForm } from '../components/listing-type-form';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Sửa loại dịch vụ · Tenant · Bookify' }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { auth } = await requireTenant(request, 'tenant.listings.write');
  const res = await apiGet<ListingTypeResponse>(`/tenant/listing-types/${params.listingTypeId}`, auth);
  if (!res.ok || !res.data) {
    throw new Response('Không tìm thấy loại dịch vụ.', { status: res.status === 403 ? 403 : 404 });
  }
  return { listingType: res.data };
}

export async function action({ request, params }: Route.ActionArgs) {
  const { auth } = await requireTenant(request, 'tenant.listings.write');
  const parsed = updateListingTypeInputSchema.safeParse(await request.json());
  if (!parsed.success) {
    return routeData({ error: null, fieldErrors: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const res = await apiPatch(`/tenant/listing-types/${params.listingTypeId}`, parsed.data, auth);
  if (!res.ok) {
    return routeData({ error: res.error ?? 'Lưu không thành công.', fieldErrors: res.errors ?? null }, { status: 400 });
  }
  return redirect('/tenant/listing-types');
}

export default function EditListingType({ loaderData, actionData }: Route.ComponentProps) {
  return (
    <div className="space-y-5">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
          <Link to="/tenant/listing-types"><ArrowLeft className="size-4" /> Loại dịch vụ</Link>
        </Button>
        <PageHeader title="Sửa loại dịch vụ" description={loaderData.listingType.name} />
      </div>
      <ListingTypeForm
        listingType={loaderData.listingType}
        serverError={actionData?.error ?? null}
        fieldErrors={actionData?.fieldErrors ?? null}
      />
    </div>
  );
}
