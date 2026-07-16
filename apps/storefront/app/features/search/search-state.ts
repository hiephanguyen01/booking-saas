import type { PriceUnit } from '../../lib/ui';
import { addDays, todayInTz, DEFAULT_TZ } from '../../lib/time';

export type SearchMode = 'hourly' | 'daily';
export type SearchArea = '' | 'under-25' | '25-50' | '50-100' | 'over-100';
export type SearchSort = 'relevance' | 'price-asc' | 'rating' | 'bookings';

export interface StorefrontSearchState {
  q: string;
  location: string;
  mode: SearchMode;
  date: string;
  from: string;
  to: string;
  hasDateSelection: boolean;
  hasDailyRange: boolean;
  guests: number;
  minPrice: number | null;
  maxPrice: number | null;
  amenities: string[];
  area: SearchArea;
  sort: SearchSort;
  page: number;
}

export interface SearchRoomSummary {
  slug: string;
  title: string;
  price: string;
  capacity: number | null;
}

export interface EnrichedSearchListing {
  id: string;
  kind: 'listing' | 'group';
  title: string;
  slug: string;
  photos: string[];
  address: string | null;
  workingArea: string | null;
  wardName: string | null;
  provinceName: string | null;
  amenities: string[];
  priceFrom: string;
  /** Locale-independent; rendered via the listing.perHour/perDay i18n keys. */
  priceUnit: PriceUnit;
  matchingRoomCount: number;
  rooms: SearchRoomSummary[];
}

export interface SearchDateSelection {
  mode: SearchMode;
  date: string;
  from: string;
  to: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function dateParam(value: string | null, fallback: string): string {
  return value && DATE_RE.test(value) ? value : fallback;
}

function positiveInt(value: string | null, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function money(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value.replace(/\D/g, ''));
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

export function parseSearchState(params: URLSearchParams): StorefrontSearchState {
  const today = todayInTz(DEFAULT_TZ);
  const mode: SearchMode = params.get('mode') === 'daily' ? 'daily' : 'hourly';
  const rawDate = params.get('date');
  const rawFrom = params.get('from');
  const rawTo = params.get('to');
  const from = dateParam(rawFrom, today);
  const toCandidate = dateParam(params.get('to'), addDays(from, 1));
  const to = toCandidate > from ? toCandidate : addDays(from, 1);
  const areaParam = params.get('area');
  const area: SearchArea = ['under-25', '25-50', '50-100', 'over-100'].includes(areaParam ?? '')
    ? (areaParam as SearchArea)
    : '';
  const sortParam = params.get('sort');
  const sort: SearchSort = ['price-asc', 'rating', 'bookings'].includes(sortParam ?? '')
    ? (sortParam as SearchSort)
    : 'relevance';

  return {
    q: params.get('q')?.trim().slice(0, 200) ?? '',
    location: params.get('location')?.trim().slice(0, 200) ?? '',
    mode,
    date: dateParam(rawDate, today),
    from,
    to,
    hasDateSelection: Boolean(rawDate && DATE_RE.test(rawDate)),
    hasDailyRange: Boolean(
      rawFrom && rawTo && DATE_RE.test(rawFrom) && DATE_RE.test(rawTo) && rawTo > rawFrom,
    ),
    guests: Math.min(100, positiveInt(params.get('guests'), 1)),
    minPrice: money(params.get('minPrice')),
    maxPrice: money(params.get('maxPrice')),
    amenities: [...new Set(params.getAll('amenities').flatMap((item) => item.split(',')))].filter(
      Boolean,
    ),
    area,
    sort,
    page: positiveInt(params.get('page'), 1),
  };
}

export function searchContextParams(state: StorefrontSearchState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.q) params.set('q', state.q);
  if (state.location) params.set('location', state.location);
  params.set('mode', state.mode);
  params.set('guests', String(state.guests));
  if (state.mode === 'hourly' && state.hasDateSelection) params.set('date', state.date);
  else if (state.mode === 'daily' && state.hasDailyRange) {
    params.set('from', state.from);
    params.set('to', state.to);
  }
  return params;
}

export function withSearchContext(path: string, state: StorefrontSearchState): string {
  const params = searchContextParams(state);
  return `${path}?${params.toString()}`;
}

export function locationSelectOptions(locations: string[], selected: string): string[] {
  const values = selected ? [selected, ...locations] : locations;
  const unique = new Map<string, string>();
  for (const raw of values) {
    const value = raw.trim();
    if (!value) continue;
    const key = value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('vi');
    if (!unique.has(key)) unique.set(key, value);
  }
  return [...unique.values()].sort((a, b) => a.localeCompare(b, 'vi'));
}

export function dateSelectionForMode(nextMode: SearchMode): SearchDateSelection {
  return { mode: nextMode, date: '', from: '', to: '' };
}

/**
 * The dates the visitor actually chose. `date`/`from`/`to` carry today/tomorrow
 * fallbacks so consumers always have a usable value; a form seeding its own
 * state from them would submit a filter nobody asked for, so gate on the
 * explicit-selection flags.
 */
export function selectedDates(state: StorefrontSearchState): SearchDateSelection {
  return {
    mode: state.mode,
    date: state.hasDateSelection ? state.date : '',
    from: state.hasDailyRange ? state.from : '',
    to: state.hasDailyRange ? state.to : '',
  };
}

export function validDailyRange(
  from: string | undefined,
  to: string | undefined,
): { from: string; to: string } | null {
  if (!from || !to || !DATE_RE.test(from) || !DATE_RE.test(to) || to <= from) return null;
  return { from, to };
}

export function rangeDates(from: string, to: string): string[] {
  const dates: string[] = [];
  for (let cursor = from; cursor < to; cursor = addDays(cursor, 1)) dates.push(cursor);
  return dates;
}

export function numberAttribute(
  attributes: Record<string, unknown>,
  keys: string[],
): number | null {
  for (const key of keys) {
    const raw = attributes[key];
    const value =
      typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw.replace(',', '.')) : NaN;
    if (Number.isFinite(value) && value >= 0) return value;
  }
  return null;
}

export function matchesArea(area: SearchArea, value: number | null): boolean {
  if (!area || value === null) return true;
  if (area === 'under-25') return value < 25;
  if (area === '25-50') return value >= 25 && value < 50;
  if (area === '50-100') return value >= 50 && value < 100;
  return value >= 100;
}
