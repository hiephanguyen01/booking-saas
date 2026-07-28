import { loadAdministrativeProvinces } from '~/lib/administrative-divisions.server';
import { searchListings } from '~/features/catalog/server/catalog.server';
import { parseSearchState, type StorefrontSearchState } from '~/features/search/lib/search-state';

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
const ATTRIBUTE_KEY_RE = /^attr\.[A-Za-z][A-Za-z0-9_]{0,49}(\.(min|max))?$/;
const MAX_ATTRIBUTE_KEYS = 30;
const MAX_ATTRIBUTE_VALUES = 30;
const MAX_ATTRIBUTE_VALUE_LENGTH = 120;

export async function loadCatalogRoute(request: Request, url: URL, typeSlug: string) {
  const state = parseSearchState(url.searchParams);
  const apiSearch = catalogApiSearch(url.searchParams, typeSlug, state);
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
  // Build from an allowlist rather than forwarding arbitrary browser query
  // parameters through the BFF to the public catalog endpoint.
  const search = new URLSearchParams({ type: typeSlug });
  const rawMode = input.get('mode');
  const mode = rawMode && API_MODES.has(rawMode) ? rawMode : null;
  if (mode) search.set('mode', mode);

  setIfPresent(search, 'q', state.q);
  setIfPresent(search, 'location', state.location);
  setIfPresent(search, 'minPrice', state.minPrice === null ? null : String(state.minPrice));
  const validMaxPrice =
    state.maxPrice !== null && (state.minPrice === null || state.maxPrice >= state.minPrice)
      ? state.maxPrice
      : null;
  setIfPresent(search, 'maxPrice', validMaxPrice === null ? null : String(validMaxPrice));
  setIfPresent(search, 'minRating', state.minRating === null ? null : String(state.minRating));
  search.set('guests', String(state.guests));
  search.set('quantity', String(state.quantity));
  search.set('sort', state.sort);
  search.set('page', String(state.page));

  for (const amenity of state.amenities
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 30)) {
    search.append('amenities', amenity.slice(0, 120));
  }

  appendSafeAttributeFilters(search, input);
  if (state.area) search.set('attr.area', state.area);

  const supportsHourlyDate = mode === null || mode === 'hourly';
  if (supportsHourlyDate && state.hasDateSelection) {
    search.set('date', state.date);
    if (state.hasTimeSelection) {
      search.set('startTime', state.startTime);
      search.set('endTime', state.endTime);
    }
  }

  const supportsDailyRange = mode === null || mode === 'daily' || mode === 'inventory';
  if (supportsDailyRange && state.hasDailyRange) {
    search.set('from', state.from);
    search.set('to', state.to);
  }

  return search;
}

function appendSafeAttributeFilters(search: URLSearchParams, input: URLSearchParams): void {
  const keys = [...new Set([...input.keys()].filter((key) => ATTRIBUTE_KEY_RE.test(key)))].slice(
    0,
    MAX_ATTRIBUTE_KEYS,
  );
  const rangeBases = new Set<string>();

  for (const key of keys) {
    const values = input
      .getAll(key)
      .flatMap((value) => value.split(','))
      .map((value) => value.trim())
      .filter(Boolean)
      .slice(0, MAX_ATTRIBUTE_VALUES);
    if (values.length === 0) continue;

    if (key.endsWith('.min') || key.endsWith('.max')) {
      const value = values[0]!.slice(0, MAX_ATTRIBUTE_VALUE_LENGTH);
      if (!Number.isFinite(Number(value))) continue;
      search.set(key, value);
      rangeBases.add(key.slice(0, -4));
      continue;
    }

    for (const value of values) {
      search.append(key, value.slice(0, MAX_ATTRIBUTE_VALUE_LENGTH));
    }
  }

  for (const base of rangeBases) {
    const minKey = `${base}.min`;
    const maxKey = `${base}.max`;
    const min = search.get(minKey);
    const max = search.get(maxKey);
    if (min !== null && max !== null && Number(min) > Number(max)) {
      search.delete(maxKey);
    }
  }
}

function setIfPresent(search: URLSearchParams, key: string, value: string | null): void {
  if (value) search.set(key, value);
}
