import type { Route } from './+types/catalog';
import { RouteErrorState } from '@booking/ui/components/route-error-state';
import { CatalogPage } from '../features/catalog/catalog-page';
import { NsI18n, useTranslation } from '../lib/i18n';
import { loadAdministrativeProvinces } from '../lib/administrative-divisions.server';
import { searchListings } from '../lib/catalog.server';
import { parseSearchState } from '../features/search/search-state';

/** Search params that make this a filtered view rather than the canonical catalog page. */
const FILTER_PARAMS = [
  'q',
  'location',
  'minPrice',
  'maxPrice',
  'minRating',
  'area',
  'amenities',
  'date',
  'from',
  'to',
];

export function meta({ loaderData, params }: Route.MetaArgs): Route.MetaDescriptors {
  return [
    { title: loaderData?.type.name ?? params.typeSlug },
    ...(loaderData?.noIndex ? [{ name: 'robots', content: 'noindex,follow' }] : []),
  ];
}

export async function loader({ request, params, url }: Route.LoaderArgs) {
  const state = parseSearchState(url.searchParams);
  const apiSearch = new URLSearchParams(url.searchParams);
  apiSearch.set('type', params.typeSlug);
  apiSearch.delete('area');
  const legacyArea = url.searchParams.get('area');
  if (legacyArea) apiSearch.set('attr.area', legacyArea);
  const [result, provinces] = await Promise.all([
    searchListings(request, apiSearch),
    loadAdministrativeProvinces(request),
  ]);
  const type = result.type;
  const search = {
    items: result.items.map((item) => ({
      ...item,
      workingArea: null,
    })),
    total: result.pagination.total,
    page: result.pagination.page,
    totalPages: result.pagination.totalPages,
    locations: provinces.map((province) => ({ value: province.code, label: province.name })),
    amenities: result.facets.find((facet) => facet.key === 'amenities')?.options ?? [],
    facets: result.facets,
    sortOptions: result.sortOptions,
  };
  const resolvedState = {
    ...state,
    mode: result.applied.mode ?? ('none' as const),
    page: result.pagination.page,
  };
  return {
    type,
    search,
    state: resolvedState,
    // Presence alone would flag the canonical page too: the filter form submits
    // every control it owns, so an untouched "Áp dụng" carries empty values.
    noIndex: [...url.searchParams].some(
      ([key, value]) =>
        (FILTER_PARAMS.includes(key) || key.startsWith('attr.')) && value.trim() !== '',
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
