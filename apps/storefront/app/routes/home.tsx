import { useOutletContext } from 'react-router';
import { loadAdministrativeProvinces } from '../lib/administrative-divisions.server';
import { getOptionalStorefrontTenant } from '../lib/request-context.server';
import type { StorefrontContext } from '../root';
import { homeTemplateFor } from '../templates';
import { loadHomeCatalog } from '../templates/studio/home-data.server';
import type { Route } from './+types/home';

export async function loader({ request }: Route.LoaderArgs) {
  if (!getOptionalStorefrontTenant()) return { kind: 'platform' as const };

  const [{ listings }, provinces] = await Promise.all([
    loadHomeCatalog(request),
    loadAdministrativeProvinces(request),
  ]);
  const locations = provinces.map((province) => ({
    value: province.code,
    label: province.name,
  }));
  return { kind: 'tenant' as const, listings, locations };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  if (loaderData.kind === 'platform') return null;
  return <TenantHome loaderData={loaderData} />;
}

function TenantHome({
  loaderData,
}: {
  loaderData: Extract<Route.ComponentProps['loaderData'], { kind: 'tenant' }>;
}) {
  const { tenant, listingTypes } = useOutletContext<StorefrontContext>();
  const { listings, locations } = loaderData;
  const Template = homeTemplateFor(tenant.vertical);
  return (
    <Template
      tenant={tenant}
      listingTypes={listingTypes}
      listings={listings}
      locations={locations}
    />
  );
}
