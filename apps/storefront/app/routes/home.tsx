import { useOutletContext } from 'react-router';
import { deriveLocationSuggestions } from '../lib/search.server';
import type { StorefrontContext } from '../root';
import { homeTemplateFor } from '../templates';
import { loadHomeCatalog } from '../templates/studio/home-data.server';
import { homeLocationSuggestions } from '../templates/studio/home-listing-presentation';
import type { Route } from './+types/home';

export async function loader({ request }: Route.LoaderArgs) {
  const { listings, usesFixtures } = await loadHomeCatalog(request);
  const locations = usesFixtures
    ? homeLocationSuggestions(listings)
    : await deriveLocationSuggestions(request, listings);
  return { listings, locations };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const { tenant, listingTypes } = useOutletContext<StorefrontContext>();
  const { listings, locations } = loaderData;
  const Template = homeTemplateFor(tenant.vertical);
  return <Template tenant={tenant} listingTypes={listingTypes} listings={listings} locations={locations} />;
}
