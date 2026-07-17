import { useOutletContext } from 'react-router';
import { loadAdministrativeProvinces } from '../lib/administrative-divisions.server';
import type { StorefrontContext } from '../root';
import { homeTemplateFor } from '../templates';
import { loadHomeCatalog } from '../templates/studio/home-data.server';
import type { Route } from './+types/home';

export async function loader({ request }: Route.LoaderArgs) {
  const [{ listings }, provinces] = await Promise.all([
    loadHomeCatalog(request),
    loadAdministrativeProvinces(request),
  ]);
  const locations = provinces.map((province) => ({
    value: province.code,
    label: province.name,
  }));
  return { listings, locations };
}

export default function Home({ loaderData }: Route.ComponentProps) {
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
