import { useOutletContext } from 'react-router';
import type { Route } from './+types/home';
import type { StorefrontContext } from '../root';
import { fetchListings } from '../lib/catalog.server';
import { homeTemplateFor } from '../templates';

export async function loader({ request }: Route.LoaderArgs) {
  const listings = await fetchListings(request, new URLSearchParams());
  return { listings };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const { tenant, listingTypes } = useOutletContext<StorefrontContext>();
  const { listings } = loaderData;
  const Template = homeTemplateFor(tenant.vertical);
  return <>{Template({ tenant, listingTypes, listings })}</>;
}
