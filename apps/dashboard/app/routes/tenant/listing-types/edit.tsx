import { data as routeData, redirect } from 'react-router';
import { updateListingTypeInputSchema, type ListingTypeResponse } from '@booking/contracts';
import type { Route } from './+types/edit';
import { apiGet, apiPatch } from '~/lib/api.server';
import { requireTenant } from '~/features/tenant/server/tenant.server';
import { FormPage } from '~/components/form-page';
import { dashboardPaths } from '~/constants/paths';
import { ListingTypeForm } from '~/features/tenant/components/listing-type-form';
import { apiPaths } from '~/constants/api-paths';
import { actionMessages, notFoundMessages } from '~/constants/messages';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Sửa loại dịch vụ · Tenant · BookingOS' }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { auth } = await requireTenant(request, 'tenant.listings.write');
  const res = await apiGet<ListingTypeResponse>(apiPaths.tenant.listingType(params.listingTypeId), auth);
  if (!res.ok || !res.data) {
    throw new Response(notFoundMessages.listingType, { status: res.status === 403 ? 403 : 404 });
  }
  return { listingType: res.data };
}

export async function action({ request, params }: Route.ActionArgs) {
  const { auth } = await requireTenant(request, 'tenant.listings.write');
  const parsed = updateListingTypeInputSchema.safeParse(await request.json());
  if (!parsed.success) {
    return routeData({ error: null, fieldErrors: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const res = await apiPatch(apiPaths.tenant.listingType(params.listingTypeId), parsed.data, auth);
  if (!res.ok) {
    return routeData({ error: res.error ?? actionMessages.saveFailed, fieldErrors: res.errors ?? null }, { status: 400 });
  }
  return redirect(dashboardPaths.tenant.listingTypes);
}

export default function EditListingType({ loaderData, actionData }: Route.ComponentProps) {
  return (
    <FormPage
      backTo={dashboardPaths.tenant.listingTypes}
      backLabel="Loại dịch vụ"
      title="Sửa loại dịch vụ"
      description={loaderData.listingType.name}
    >
      <ListingTypeForm
        listingType={loaderData.listingType}
        serverError={actionData?.error ?? null}
        fieldErrors={actionData?.fieldErrors ?? null}
      />
    </FormPage>
  );
}
