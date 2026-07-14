import type { Route } from './+types/catalog';
import { RouteErrorState } from '@booking/ui/components/route-error-state';
import { CatalogPage } from '../features/catalog/catalog-page';
import { fetchListingTypes, fetchListings } from '../lib/catalog.server';

export function meta({ params }: Route.MetaArgs): Route.MetaDescriptors {
  return [{ title: params.typeSlug }];
}

export async function loader({ request, params, url }: Route.LoaderArgs) {
  const search = new URLSearchParams(url.searchParams);
  search.set('type', params.typeSlug);

  const [types, listings] = await Promise.all([
    fetchListingTypes(request),
    fetchListings(request, search),
  ]);

  return {
    type: types.find((item) => item.slug === params.typeSlug) ?? null,
    listings,
  };
}

export default function CatalogRoute(props: Route.ComponentProps) {
  return <CatalogPage {...props} />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return <RouteErrorState error={error} homeHref="/" homeLabel="Về trang chủ" />;
}
