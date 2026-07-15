import type { Route } from './+types/catalog';
import { RouteErrorState } from '@booking/ui/components/route-error-state';
import { CatalogPage } from '../features/catalog/catalog-page';
import { fetchListingTypes, fetchListings } from '../lib/catalog.server';
import { composeSearchResults } from '../lib/search.server';
import { parseSearchState } from '../features/search/search-state';

export function meta({ loaderData, params }: Route.MetaArgs): Route.MetaDescriptors {
  return [
    { title: loaderData?.type.name ?? params.typeSlug },
    ...(loaderData?.noIndex ? [{ name: 'robots', content: 'noindex,follow' }] : []),
  ];
}

export async function loader({ request, params, url }: Route.LoaderArgs) {
  const state = parseSearchState(url.searchParams);
  const apiSearch = new URLSearchParams({ type: params.typeSlug });
  if (state.q) apiSearch.set('q', state.q);
  for (const [key, value] of url.searchParams) {
    if (key.startsWith('attr.') && value) apiSearch.set(key, value);
  }

  const [types, candidates] = await Promise.all([
    fetchListingTypes(request),
    fetchListings(request, apiSearch),
  ]);

  const type = types.find((item) => item.slug === params.typeSlug) ?? null;
  if (!type) throw new Response('Listing type not found', { status: 404 });

  const search = await composeSearchResults(request, candidates, state);
  return {
    type,
    search,
    state,
    noIndex: ['q', 'location', 'minPrice', 'maxPrice', 'area', 'amenities'].some((key) =>
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
