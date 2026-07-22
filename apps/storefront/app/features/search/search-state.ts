import type { PriceUnit } from '../../lib/ui';
import { normalizeDailyRange } from '../../lib/daily-range';
import { canOffsetDateOnly, isValidDateOnly } from '../../lib/date-only';
import { addDays, todayInTz, DEFAULT_TZ } from '../../lib/time';

export type SearchMode = 'hourly' | 'daily' | 'inventory' | 'none';
export type SearchArea = '' | 'under-25' | '25-50' | '50-100' | 'over-100';
export type SearchSort = 'relevance' | 'price-asc' | 'bookings-desc';

export interface StorefrontSearchState {
  q: string;
  location: string;
  mode: SearchMode;
  date: string;
  startTime: string;
  endTime: string;
  from: string;
  to: string;
  hasDateSelection: boolean;
  hasTimeSelection: boolean;
  hasDailyRange: boolean;
  guests: number;
  quantity: number;
  minPrice: number | null;
  maxPrice: number | null;
  minRating: number | null;
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
  regularPriceFrom: string;
  ratingAvg: number | null;
  reviewCount: number;
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

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_SEARCH_AMENITIES = 30;
const MAX_SEARCH_AMENITY_LENGTH = 120;
const MAX_CATALOG_PAGE = 10_000;

function dateParam(value: string | null, fallback: string, offsetDays = 0): string {
  return value && canOffsetDateOnly(value, offsetDays) ? value : fallback;
}

function positiveInt(value: string | null, fallback: number, max = Number.MAX_SAFE_INTEGER): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback;
}

function money(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value.replace(/\D/g, ''));
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function rating(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) &&
    parsed >= 1 &&
    parsed <= 5 &&
    parsed * 2 === Math.round(parsed * 2)
    ? parsed
    : null;
}

function amenityParams(params: URLSearchParams): string[] {
  const amenities: string[] = [];
  const seen = new Set<string>();

  for (const raw of params.getAll('amenities').flatMap((item) => item.split(','))) {
    const value = raw.trim().slice(0, MAX_SEARCH_AMENITY_LENGTH);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    amenities.push(value);
    if (amenities.length >= MAX_SEARCH_AMENITIES) break;
  }

  return amenities;
}

export function parseSearchState(params: URLSearchParams): StorefrontSearchState {
  const today = todayInTz(DEFAULT_TZ);
  const rawMode = params.get('mode');
  const mode: SearchMode = rawMode === 'daily' || rawMode === 'inventory' ? rawMode : 'hourly';
  const rawDate = params.get('date');
  const rawFrom = params.get('from');
  const rawTo = params.get('to');
  const rawStartTime = params.get('startTime');
  const rawEndTime = params.get('endTime');
  const validDateSelection = Boolean(rawDate && isValidDateOnly(rawDate));
  const validFrom = Boolean(rawFrom && canOffsetDateOnly(rawFrom, 1));
  const validTo = Boolean(rawTo && isValidDateOnly(rawTo));
  const from = dateParam(rawFrom, today, 1);
  const toCandidate = dateParam(rawTo, addDays(from, 1));
  const to = toCandidate > from ? toCandidate : addDays(from, 1);
  const areaParam = params.get('area');
  const area: SearchArea = ['under-25', '25-50', '50-100', 'over-100'].includes(areaParam ?? '')
    ? (areaParam as SearchArea)
    : '';
  const sortParam = params.get('sort');
  const sort: SearchSort = ['price-asc', 'bookings-desc'].includes(sortParam ?? '')
    ? (sortParam as SearchSort)
    : 'relevance';

  return {
    q: params.get('q')?.trim().slice(0, 200) ?? '',
    location: params.get('location')?.trim().slice(0, 200) ?? '',
    mode,
    date: dateParam(rawDate, today),
    startTime: TIME_RE.test(rawStartTime ?? '') ? rawStartTime! : '09:00',
    endTime: TIME_RE.test(rawEndTime ?? '') ? rawEndTime! : '10:00',
    from,
    to,
    hasDateSelection: validDateSelection,
    hasTimeSelection: Boolean(
      validDateSelection &&
      rawStartTime &&
      rawEndTime &&
      TIME_RE.test(rawStartTime) &&
      TIME_RE.test(rawEndTime) &&
      rawStartTime < rawEndTime,
    ),
    hasDailyRange: Boolean(validFrom && validTo && rawFrom && rawTo && rawTo > rawFrom),
    guests: positiveInt(params.get('guests'), 1, 100),
    quantity: positiveInt(params.get('quantity'), 1, 100),
    minPrice: money(params.get('minPrice')),
    maxPrice: money(params.get('maxPrice')),
    minRating: rating(params.get('minRating')),
    amenities: amenityParams(params),
    area,
    sort,
    page: positiveInt(params.get('page'), 1, MAX_CATALOG_PAGE),
  };
}

export function searchContextParams(state: StorefrontSearchState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.q) params.set('q', state.q);
  if (state.location) params.set('location', state.location);
  if (state.mode !== 'none') params.set('mode', state.mode);
  params.set('guests', String(state.guests));
  if (state.mode === 'inventory') params.set('quantity', String(state.quantity));
  if (state.mode === 'hourly' && state.hasDateSelection) {
    params.set('date', state.date);
    if (state.hasTimeSelection) {
      params.set('startTime', state.startTime);
      params.set('endTime', state.endTime);
    }
  } else if ((state.mode === 'daily' || state.mode === 'inventory') && state.hasDailyRange) {
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
  const range = normalizeDailyRange(from, to);
  return range ? { from: range.from, to: range.to } : null;
}

/**
 * Whether the search form may submit its current date selection.
 *
 * Submitting with no date at all is legitimate — the form omits the date params
 * and the catalog applies no date filter. Only a daily range the visitor started
 * but did not finish blocks submission, because submitting it would silently
 * drop the half they did pick.
 */
export function canSubmitSearch(
  mode: SearchMode,
  from: string | undefined,
  to: string | undefined,
): boolean {
  if (mode === 'hourly' || mode === 'none' || !from) return true;
  return validDailyRange(from, to) !== null;
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
