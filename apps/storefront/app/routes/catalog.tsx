import type { Route } from './+types/catalog';
import { RouteErrorState } from '@booking/ui/components/route-error-state';
import { CatalogPage } from '../features/catalog/catalog-page';
import { NsI18n, useTranslation } from '../lib/i18n';
import { fetchListingTypes, fetchListings } from '../lib/catalog.server';
import { composeSearchResults } from '../lib/search.server';
import { parseSearchState } from '../features/search/search-state';

/** Search params that make this a filtered view rather than the canonical catalog page. */
const FILTER_PARAMS = ['q', 'location', 'minPrice', 'maxPrice', 'area', 'amenities'];

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
    // Presence alone would flag the canonical page too: the filter form submits
    // every control it owns, so an untouched "Áp dụng" carries empty values.
    noIndex: FILTER_PARAMS.some((key) =>
      url.searchParams.getAll(key).some((value) => value.trim() !== ''),
    ),
  };
}

export default function CatalogRoute(props: Route.ComponentProps) {
  return <CatalogPage {...props} />;
}

export function ErrorBoundary({ error, params }: Route.ErrorBoundaryProps) {
  const locale = params.locale === 'en' ? 'en' : 'vi';
  const { t } = useTranslation(NsI18n.Error);
  return <RouteErrorState error={error} homeHref={`/${locale}`} homeLabel={t('home')} />;
}
