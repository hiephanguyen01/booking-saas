import { data as routeData, redirect } from 'react-router';
import { updateListingTypeInputSchema, type ListingTypeResponse } from '@booking/contracts';
import type { Route } from './+types/edit';
import { apiGet, apiPatch } from '~/lib/api.server';
import { requireTenant } from '~/features/tenant/server/tenant.server';
import { BackLink } from '~/components/back-link';
import { PageHeader } from '~/components/page-header';
import { ListingTypeForm } from '~/features/tenant/components/listing-type-form';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Sửa loại dịch vụ · Tenant · BookingOS' }];
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
        <BackLink to="/tenant/listing-types" label="Loại dịch vụ" className="mb-2" />
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
