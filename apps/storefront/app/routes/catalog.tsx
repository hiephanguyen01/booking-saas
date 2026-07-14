import type { Route } from './+types/catalog';
import { RouteErrorState } from '@booking/ui/components/route-error-state';
import { CatalogPage } from '../features/catalog/catalog-page';
import { fetchListingTypes, fetchListings } from '../lib/catalog.server';

export function meta({ loaderData, params }: Route.MetaArgs): Route.MetaDescriptors {
  return [
    { title: loaderData?.type.name ?? params.typeSlug },
    ...(loaderData?.noIndex ? [{ name: 'robots', content: 'noindex,follow' }] : []),
  ];
}

export async function loader({ request, params, url }: Route.LoaderArgs) {
  const search = new URLSearchParams(url.searchParams);
  search.set('type', params.typeSlug);

  const [types, listings] = await Promise.all([
    fetchListingTypes(request),
    fetchListings(request, search),
  ]);

  const type = types.find((item) => item.slug === params.typeSlug) ?? null;
  if (!type) throw new Response('Listing type not found', { status: 404 });

  return {
    type,
    listings,
    noIndex: ['q', 'city', 'minPrice', 'maxPrice', 'rating', 'amenity'].some((key) =>
      url.searchParams.has(key),
    ),
  };
}

export default function CatalogRoute(props: Route.ComponentProps) {
  return <CatalogPage {...props} />;
}

export function ErrorBoundary({ error, params }: Route.ErrorBoundaryProps) {
  const locale = params.locale === 'en' ? 'en' : 'vi';
  return <RouteErrorState error={error} homeHref={`/${locale}`} homeLabel="Về trang chủ" />;
}
