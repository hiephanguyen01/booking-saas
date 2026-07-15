import type {
  AvailabilityResponse,
  PublicListingDetailResponse,
  PublicListingGroupDetailResponse,
  PublicListingResponse,
} from '@booking/contracts';
import { fetchAvailability } from './booking.server';
import { fetchListing, fetchListingGroup, fetchQuote } from './catalog.server';
import { addDays, nightsBetween, zonedToUtcIso } from './time';
import {
  matchesArea,
  numberAttribute,
  rangeDates,
  type StorefrontSearchState,
} from '../features/search/search-state';

const CAPACITY_KEYS = ['capacity', 'maxGuests', 'guestCapacity', 'sucChua'];
const AREA_KEYS = ['area', 'areaM2', 'squareMeters', 'dienTich'];

import type { EnrichedSearchListing, SearchRoomSummary } from '../features/search/search-state';

export interface SearchComposition {
  items: EnrichedSearchListing[];
  total: number;
  page: number;
  totalPages: number;
  locations: string[];
  amenities: string[];
}

interface RoomCandidate {
  slug: string;
  title: string;
  attributes: Record<string, unknown>;
  bookingModes: string[];
}

type EvaluatedRoom = SearchRoomSummary;

function normalized(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('vi')
    .trim();
}

function stringPhotos(photos: unknown[]): string[] {
  return photos.filter((photo): photo is string => typeof photo === 'string' && photo.length > 0);
}

function containsLocation(group: PublicListingGroupDetailResponse, location: string): boolean {
  if (!location) return true;
  const haystack = normalized(
    `${group.address ?? ''} ${group.workingArea ?? ''} ${group.wardName ?? ''} ${group.provinceName ?? ''}`,
  );
  return haystack.includes(normalized(location));
}

function attributeTokens(attributes: Record<string, unknown>): string[] {
  const tokens: string[] = [];
  for (const value of Object.values(attributes)) {
    if (typeof value === 'string') tokens.push(value);
    else if (Array.isArray(value))
      tokens.push(...value.filter((item): item is string => typeof item === 'string'));
  }
  return tokens.map(normalized);
}

function matchesAmenities(
  selected: string[],
  groupAmenities: string[],
  attributes: Record<string, unknown>,
): boolean {
  if (selected.length === 0) return true;
  const available = new Set([...groupAmenities.map(normalized), ...attributeTokens(attributes)]);
  return selected.every((amenity) => available.has(normalized(amenity)));
}

function roomPassesStaticFilters(
  room: RoomCandidate,
  groupAmenities: string[],
  state: StorefrontSearchState,
): boolean {
  if (!room.bookingModes.includes(state.mode)) return false;
  const capacity = numberAttribute(room.attributes, CAPACITY_KEYS);
  if (capacity !== null && capacity < state.guests) return false;
  if (!matchesArea(state.area, numberAttribute(room.attributes, AREA_KEYS))) return false;
  return matchesAmenities(state.amenities, groupAmenities, room.attributes);
}

async function safely<T>(work: Promise<T>): Promise<T | null> {
  try {
    return await work;
  } catch {
    return null;
  }
}

function dailyConfig(listing: PublicListingDetailResponse): {
  checkinTime: string;
  checkoutTime: string;
  minNights: number;
  maxNights: number | null;
} {
  const raw = (listing.modeConfig.daily ?? {}) as Record<string, unknown>;
  return {
    checkinTime: typeof raw.checkinTime === 'string' ? raw.checkinTime : '14:00',
    checkoutTime: typeof raw.checkoutTime === 'string' ? raw.checkoutTime : '12:00',
    minNights: Number.isFinite(Number(raw.minNights)) ? Number(raw.minNights) : 1,
    maxNights: Number.isFinite(Number(raw.maxNights)) ? Number(raw.maxNights) : null,
  };
}

async function evaluateRoom(
  request: Request,
  room: RoomCandidate,
  groupAmenities: string[],
  state: StorefrontSearchState,
): Promise<EvaluatedRoom | null> {
  if (!roomPassesStaticFilters(room, groupAmenities, state)) return null;
  const detail = await safely(fetchListing(request, room.slug));
  if (!detail || !detail.bookingModes.includes(state.mode)) return null;

  const capacity = numberAttribute(room.attributes, CAPACITY_KEYS);
  if (state.mode === 'hourly') {
    const availability = await safely(
      fetchAvailability(request, room.slug, { mode: 'hourly', from: state.date, to: state.date }),
    );
    if (!availability || availability.mode !== 'hourly') return null;
    const slots = availability.days.flatMap((day) => day.slots).filter((slot) => slot.available);
    if (slots.length === 0) return null;
    const price = slots.reduce(
      (min, slot) => Math.min(min, Number(slot.price)),
      Number.POSITIVE_INFINITY,
    );
    if (!Number.isFinite(price)) return null;
    if (state.minPrice !== null && price < state.minPrice) return null;
    if (state.maxPrice !== null && price > state.maxPrice) return null;
    return { slug: room.slug, title: room.title, price: String(price), capacity };
  }

  const nights = nightsBetween(state.from, state.to);
  const config = dailyConfig(detail);
  if (nights < config.minNights || (config.maxNights !== null && nights > config.maxNights))
    return null;
  const lastNight = addDays(state.to, -1);
  const availability = await safely(
    fetchAvailability(request, room.slug, { mode: 'daily', from: state.from, to: lastNight }),
  );
  if (!availability || availability.mode !== 'daily') return null;
  const available = new Set(
    availability.days.filter((day) => day.status === 'available').map((day) => day.date),
  );
  if (!rangeDates(state.from, state.to).every((date) => available.has(date))) return null;

  const start = zonedToUtcIso(state.from, config.checkinTime, availability.timezone);
  const end = zonedToUtcIso(state.to, config.checkoutTime, availability.timezone);
  const quote = await safely(
    fetchQuote(
      request,
      room.slug,
      new URLSearchParams({ mode: 'daily', from: start, to: end, quantity: '1' }),
    ),
  );
  if (!quote) return null;
  const price = Number(quote.subtotal);
  if (!Number.isFinite(price)) return null;
  if (state.minPrice !== null && price < state.minPrice) return null;
  if (state.maxPrice !== null && price > state.maxPrice) return null;
  return { slug: room.slug, title: room.title, price: String(price), capacity };
}

async function mapLimit<T, R>(
  values: T[],
  limit: number,
  mapper: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < values.length) {
      const index = cursor++;
      results[index] = await mapper(values[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, worker));
  return results;
}

async function enrichGroup(
  request: Request,
  candidate: PublicListingResponse,
  state: StorefrontSearchState,
): Promise<EnrichedSearchListing | null> {
  const group = await safely(fetchListingGroup(request, candidate.slug));
  if (!group || !containsLocation(group, state.location)) return null;
  const rooms: RoomCandidate[] = group.listings.map((room) => ({
    slug: room.slug,
    title: room.title,
    attributes: room.attributes,
    bookingModes: room.bookingModes,
  }));
  const evaluated = (
    await mapLimit(rooms, 5, (room) => evaluateRoom(request, room, group.amenities, state))
  ).filter((room): room is EvaluatedRoom => room !== null);
  if (evaluated.length === 0) return null;
  const priceFrom = evaluated.reduce(
    (min, room) => Math.min(min, Number(room.price)),
    Number.POSITIVE_INFINITY,
  );
  return {
    id: group.id,
    kind: 'group',
    title: group.title,
    slug: group.slug,
    photos: group.photos,
    address: group.address,
    workingArea: group.workingArea,
    wardName: group.wardName,
    provinceName: group.provinceName,
    amenities: group.amenities,
    priceFrom: String(priceFrom),
    priceUnit: state.mode === 'hourly' ? 'giờ' : 'ngày',
    matchingRoomCount: evaluated.length,
    rooms: evaluated,
  };
}

async function enrichStandalone(
  request: Request,
  candidate: PublicListingResponse,
  state: StorefrontSearchState,
): Promise<EnrichedSearchListing | null> {
  if (state.location || state.amenities.length > 0) return null;
  const detail = await safely(fetchListing(request, candidate.slug));
  if (!detail) return null;
  const room: RoomCandidate = {
    slug: detail.slug,
    title: detail.title,
    attributes: detail.attributes,
    bookingModes: detail.bookingModes,
  };
  const evaluated = await evaluateRoom(request, room, [], state);
  if (!evaluated) return null;
  return {
    id: detail.id,
    kind: 'listing',
    title: detail.title,
    slug: detail.slug,
    photos: detail.photos.length ? detail.photos : stringPhotos(candidate.photos),
    address: detail.address,
    workingArea: null,
    wardName: detail.wardName,
    provinceName: detail.provinceName,
    amenities: [],
    priceFrom: evaluated.price,
    priceUnit: state.mode === 'hourly' ? 'giờ' : 'ngày',
    matchingRoomCount: 1,
    rooms: [evaluated],
  };
}

export async function composeSearchResults(
  request: Request,
  candidates: PublicListingResponse[],
  state: StorefrontSearchState,
  pageSize = 12,
): Promise<SearchComposition> {
  const enriched = (
    await mapLimit(candidates.slice(0, 100), 4, (candidate) =>
      candidate.kind === 'group'
        ? enrichGroup(request, candidate, state)
        : enrichStandalone(request, candidate, state),
    )
  ).filter((item): item is EnrichedSearchListing => item !== null);

  if (state.sort === 'price-asc')
    enriched.sort((a, b) => Number(a.priceFrom) - Number(b.priceFrom));
  const total = enriched.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(state.page, totalPages);
  const start = (page - 1) * pageSize;
  const locations = [
    ...new Set(
      enriched
        .flatMap((item) => [item.workingArea, item.wardName, item.provinceName, item.address])
        .filter((value): value is string => Boolean(value)),
    ),
  ];
  const amenities = [...new Set(enriched.flatMap((item) => item.amenities))];

  return {
    items: enriched.slice(start, start + pageSize),
    total,
    page,
    totalPages,
    locations,
    amenities,
  };
}

export async function deriveLocationSuggestions(
  request: Request,
  candidates: PublicListingResponse[],
): Promise<string[]> {
  const groups = candidates.filter((item) => item.kind === 'group').slice(0, 40);
  const details = await mapLimit(groups, 5, (item) =>
    safely(fetchListingGroup(request, item.slug)),
  );
  return [
    ...new Set(
      details
        .flatMap((group) =>
          group ? [group.workingArea, group.wardName, group.provinceName, group.address] : [],
        )
        .filter((value): value is string => Boolean(value)),
    ),
  ].slice(0, 20);
}

export function availabilityForRange(
  availability: AvailabilityResponse | null,
  from: string,
  to: string,
): boolean {
  if (!availability || availability.mode !== 'daily') return false;
  const open = new Set(
    availability.days.filter((day) => day.status === 'available').map((day) => day.date),
  );
  return rangeDates(from, to).every((date) => open.has(date));
}
