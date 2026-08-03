import { createListingTypeInputSchema } from '@booking/contracts';
import { redirect, data as routeData } from 'react-router';
import { FormPage } from '~/components/form-page';
import { dashboardPaths } from '~/constants/paths';
import { apiPost } from '~/lib/api.server';
import { ListingTypeForm } from '~/features/tenant/components/listing-type-form';
import { requireTenant } from '~/features/tenant/server/tenant.server';
import type { Route } from './+types/new';
import { apiPaths } from '~/constants/api-paths';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Loại dịch vụ mới · Tenant · BookingOS' }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireTenant(request, 'tenant.listings.write');
  return null;
}

export async function action({ request }: Route.ActionArgs) {
  const { auth } = await requireTenant(request, 'tenant.listings.write');
  const parsed = createListingTypeInputSchema.safeParse(await request.json());
  if (!parsed.success) {
    return routeData(
      { error: null, fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  const res = await apiPost(apiPaths.tenant.listingTypes, parsed.data, auth);
  if (!res.ok) {
    return routeData(
      { error: res.error ?? 'Tạo không thành công.', fieldErrors: res.errors ?? null },
      { status: 400 },
    );
  }
  return redirect(dashboardPaths.tenant.listingTypes);
}

export default function NewListingType({ actionData }: Route.ComponentProps) {
  return (
    <FormPage
      backTo={dashboardPaths.tenant.listingTypes}
      backLabel="Loại dịch vụ"
      title="Loại dịch vụ mới"
      description="Tạo một loại dịch vụ với hình thức đặt và thuộc tính riêng."
    >
      <ListingTypeForm
        serverError={actionData?.error ?? null}
        fieldErrors={actionData?.fieldErrors ?? null}
      />
    </FormPage>
  );
}
