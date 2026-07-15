import { useOutletContext } from 'react-router';
import { fetchListings } from '../lib/catalog.server';
import { deriveLocationSuggestions } from '../lib/search.server';
import type { StorefrontContext } from '../root';
import { homeTemplateFor } from '../templates';
import type { Route } from './+types/home';

export async function loader({ request }: Route.LoaderArgs) {
  const listings = await fetchListings(request, new URLSearchParams());
  const locations = await deriveLocationSuggestions(request, listings);
  return { listings, locations };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const { tenant, listingTypes } = useOutletContext<StorefrontContext>();
  const { listings, locations } = loaderData;
  const Template = homeTemplateFor(tenant.vertical);
  return <Template tenant={tenant} listingTypes={listingTypes} listings={listings} locations={locations} />;
}
