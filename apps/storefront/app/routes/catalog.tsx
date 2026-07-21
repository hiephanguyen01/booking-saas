import type { Route } from './+types/catalog';
import { RouteErrorState } from '@booking/ui/components/route-error-state';
import { CatalogPage } from '../features/catalog/catalog-page';
import { NsI18n, useTranslation } from '../lib/i18n';
import { loadAdministrativeProvinces } from '../lib/administrative-divisions.server';
import { searchListings } from '../lib/catalog.server';
import { parseSearchState, type StorefrontSearchState } from '../features/search/search-state';

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

const API_MODES = new Set(['hourly', 'daily', 'inventory']);

export function meta({ loaderData, params }: Route.MetaArgs): Route.MetaDescriptors {
  return [
    { title: loaderData?.type.name ?? params.typeSlug },
    ...(loaderData?.noIndex ? [{ name: 'robots', content: 'noindex,follow' }] : []),
  ];
}

export async function loader({ request, params, url }: Route.LoaderArgs) {
  const state = parseSearchState(url.searchParams);
  const apiSearch = catalogApiSearch(url.searchParams, params.typeSlug, state);
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

function catalogApiSearch(
  input: URLSearchParams,
  typeSlug: string,
  state: StorefrontSearchState,
): URLSearchParams {
  const search = new URLSearchParams(input);
  search.set('type', typeSlug);

  const rawMode = input.get('mode');
  if (rawMode && API_MODES.has(rawMode)) search.set('mode', rawMode);
  else search.delete('mode');

  setOrDelete(search, 'q', state.q);
  setOrDelete(search, 'location', state.location);
  setOrDelete(search, 'minPrice', state.minPrice === null ? null : String(state.minPrice));
  setOrDelete(search, 'maxPrice', state.maxPrice === null ? null : String(state.maxPrice));
  setOrDelete(search, 'minRating', state.minRating === null ? null : String(state.minRating));
  search.set('guests', String(state.guests));
  search.set('quantity', String(state.quantity));
  search.set('sort', state.sort);
  search.set('page', String(state.page));

  search.delete('amenities');
  for (const amenity of state.amenities.map((item) => item.trim()).filter(Boolean).slice(0, 30)) {
    search.append('amenities', amenity.slice(0, 120));
  }

  search.delete('area');
  if (state.area) search.set('attr.area', state.area);
  else if (input.has('area')) search.delete('attr.area');

  if (state.hasDateSelection) search.set('date', state.date);
  else search.delete('date');

  if (state.hasTimeSelection) {
    search.set('startTime', state.startTime);
    search.set('endTime', state.endTime);
  } else {
    search.delete('startTime');
    search.delete('endTime');
  }

  if (state.hasDailyRange) {
    search.set('from', state.from);
    search.set('to', state.to);
  } else {
    search.delete('from');
    search.delete('to');
  }

  return search;
}

function setOrDelete(search: URLSearchParams, key: string, value: string | null): void {
  if (value) search.set(key, value);
  else search.delete(key);
}

export default function CatalogRoute(props: Route.ComponentProps) {
  return <CatalogPage {...props} />;
}

export function ErrorBoundary({ error, params }: Route.ErrorBoundaryProps) {
  const locale = params.locale === 'en' ? 'en' : 'vi';
  const { t } = useTranslation(NsI18n.Error);
  return <RouteErrorState error={error} homeHref={`/${locale}`} homeLabel={t('home')} />;
}
