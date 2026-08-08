import { TenantHome } from '~/features/home/components/tenant-home';
import { loadAdministrativeProvinces } from '~/lib/server/administrative-divisions.server';
import { getOptionalStorefrontTenant } from '~/lib/server/request-context.server';
import { loadHomeCatalog } from '~/features/home/server/home-data.server';
import { HOME_HEADER_HANDLE } from '~/features/site-shell/lib/site-header-handle';
import type { Route } from './+types/home';

/** The hero photo runs to the top of the document, so the header floats on it. */
export const handle = HOME_HEADER_HANDLE;

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
