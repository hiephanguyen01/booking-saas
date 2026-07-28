import { useOutletContext } from 'react-router';
import { homeTemplateFor } from '~/features/home/lib/home-template';
import type { loadHomeCatalog } from '~/features/home/server/home-data.server';
import type { StorefrontContext } from '~/root';

export function TenantHome({
  listings,
  locations,
}: {
  listings: Awaited<ReturnType<typeof loadHomeCatalog>>['listings'];
  locations: Array<{ value: string; label: string }>;
}) {
  const { tenant, listingTypes } = useOutletContext<StorefrontContext>();
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
