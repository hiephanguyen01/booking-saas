import { TenantHome } from '~/features/home/components/tenant-home';
import { loadAdministrativeProvinces } from '~/lib/server/administrative-divisions.server';
import { getOptionalStorefrontTenant } from '~/lib/server/request-context.server';
import { loadHomeCatalog } from '~/features/home/server/home-data.server';
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
  return <TenantHome listings={loaderData.listings} locations={loaderData.locations} />;
}
