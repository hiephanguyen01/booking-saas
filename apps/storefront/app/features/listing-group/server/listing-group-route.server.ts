import type {
  AvailabilityResponse,
  PublicListingDetailWithTimezoneResponse,
  QuoteResponse,
} from '@booking/contracts';
import { data } from 'react-router';
import { appendViewedCookie } from '~/features/account/server/recently-viewed.server';
import { submitContentReport } from '~/features/content-reports/server/content-report.server';
import {
  parseSearchState,
  rangeDates,
  type SearchMode,
  type StorefrontSearchState,
} from '~/features/search/lib/search-state';
import { loadAdministrativeProvinces } from '~/lib/server/administrative-divisions.server';
import { fetchAvailability } from '~/features/booking/server/booking.server';
import {
  fetchListing,
  fetchListingGroup,
  fetchListings,
  fetchQuote,
} from '~/features/catalog/server/catalog.server';
import { openDailyDates } from '~/lib/availability';
import { dailyModeConfig } from '~/lib/daily-config';
import { compareMoney, minMoney } from '~/lib/money';
import { packagesForMode } from '~/lib/package-options';
import { mapWithConcurrency } from '~/lib/server/concurrency.server';
import { optionalData } from '~/lib/server/optional-data.server';
import { loadPublicReviews } from '~/features/listing/server/public-reviews.server';
import { addDays, DEFAULT_TZ, nightsBetween, todayInTz, zonedToUtcIso } from '~/lib/time';

const LISTING_DETAIL_CONCURRENCY = 4;
const PACKAGE_AVAILABILITY_CONCURRENCY = 3;
const RELATED_PAGE_SIZE = 8;

export async function handleListingGroupAction(request: Request, groupSlug: string) {
  const group = await fetchListingGroup(request, groupSlug);
  return submitContentReport(request, 'group', group?.id ?? '');
}

export async function loadListingGroupRoute(request: Request, url: URL, groupSlug: string) {
  const group = await fetchListingGroup(request, groupSlug);
  if (!group) throw new Response('Listing group not found', { status: 404 });
  const requestNow = new Date();
  const fallbackToday = todayInTz(DEFAULT_TZ, requestNow);

  const relatedSearch = new URLSearchParams({
    type: group.listingTypeSlug,
    pageSize: String(RELATED_PAGE_SIZE),
  });
  const state = parseSearchState(url.searchParams, fallbackToday);
  const fixedPackages = group.bookingSelection === 'fixed_packages';
  const hasAvailabilityFilter = fixedPackages
    ? state.hasDateSelection
    : (state.mode === 'hourly' && state.hasDateSelection) ||
      (state.mode === 'daily' && state.hasDailyRange);

  // The room fan-out is the deepest work on the page and needs none of the three
  // reads beside it, so it starts first and they all settle together.
  const [options, catalogCandidates, provinces, reviewData] = await Promise.all([
    mapWithConcurrency(group.listings, LISTING_DETAIL_CONCURRENCY, async (child) => {
      const detail = await safe(fetchListing(request, child.slug));
      if (!detail) return null;
      const availability = hasAvailabilityFilter
        ? await resolveRoomAvailability(request, child.slug, detail, state)
        : browsingRoom(child.priceFrom);
      // A room the filter excludes drops out of the list entirely.
      if (!availability) return null;
      return {
        child,
        detail,
        bookingToday: todayInTz(detail.timezone, requestNow),
        ...availability,
      };
    }),
    safe(fetchListings(request, relatedSearch)),
    loadAdministrativeProvinces(request),
    loadPublicReviews(request, url.searchParams, 'group', groupSlug),
  ]);
  const roomOptions = options.filter(
    (option): option is NonNullable<typeof option> => option !== null,
  );
  const bookingToday = roomOptions[0]?.bookingToday ?? fallbackToday;
  const renderedState = parseSearchState(url.searchParams, bookingToday);
  const locations = provinces.map((province) => ({
    value: province.code,
    label: province.name,
  }));
  const childIds = new Set(group.listings.map((listing) => listing.id));
  const relatedListings = (catalogCandidates ?? [])
    .filter(
      (listing) =>
        listing.id !== group.id &&
        !childIds.has(listing.id) &&
        listing.listingTypeSlug === group.listingTypeSlug,
    )
    .slice(0, 4);
  const payload = {
    group,
    state: renderedState,
    bookingToday,
    hasAvailabilityFilter,
    roomOptions,
    locations,
    relatedListings,
    ...reviewData,
  };

  // Record the view for the account's "Đã xem gần đây" list — see the same call
  // on the listing route for why this is null on a plain refresh.
  const setCookie = await appendViewedCookie(request, { kind: 'group', slug: group.slug });
  return setCookie ? data(payload, { headers: { 'Set-Cookie': setCookie } }) : payload;
}

function safe<T>(promise: Promise<T>): Promise<T | null> {
  return optionalData(promise, null);
}

/**
 * What resolving a room against the current search adds to its listing data. `null`
 * from a resolver means the room does not belong in the list at all (wrong mode),
 * as distinct from `available: false`, which means "shown, but not bookable".
 */
interface RoomAvailability {
  browsing: boolean;
  availability: AvailabilityResponse | null;
  /** `null` while browsing — availability was never asked for. */
  available: boolean | null;
  price: string | null;
  quote: QuoteResponse | null;
  start: string | null;
  end: string | null;
}

/** No date filter is active, so every room is listed at its catalogue "from" price. */
function browsingRoom(priceFrom: string | null): RoomAvailability {
  return {
    browsing: true,
    availability: null,
    available: null,
    price: priceFrom,
    quote: null,
    start: null,
    end: null,
  };
}

function resolveRoomAvailability(
  request: Request,
  slug: string,
  detail: PublicListingDetailWithTimezoneResponse,
  state: StorefrontSearchState,
): Promise<RoomAvailability | null> {
  if (state.mode === 'none' || !detail.bookingModes.includes(state.mode)) {
    return Promise.resolve(null);
  }
  if (detail.bookingSelection === 'fixed_packages') {
    // Inventory rooms have no package calendar of their own; they price off the
    // daily packages, same as a daily room.
    return cheapestPackageRoom(request, slug, detail.modeConfig, state.mode, state.date);
  }
  return state.mode === 'hourly'
    ? hourlyRoom(request, slug, detail, state)
    : dailyRoom(request, slug, detail, state);
}

/**
 * A fixed-package room is bookable if any one of its packages has an opening on the
 * chosen day; it advertises the cheapest such package. Packages are probed
 * concurrently because each one is a separate availability call.
 */
async function cheapestPackageRoom(
  request: Request,
  slug: string,
  modeConfig: Record<string, unknown>,
  searchMode: Exclude<SearchMode, 'none'>,
  date: string,
): Promise<RoomAvailability> {
  const mode = searchMode === 'hourly' ? 'hourly' : 'daily';
  const packages = packagesForMode(modeConfig, mode);
  const probed = await mapWithConcurrency(
    packages,
    PACKAGE_AVAILABILITY_CONCURRENCY,
    async (item) => ({
      item,
      availability: await safe(
        fetchAvailability(request, slug, { mode, from: date, to: date, packageId: item.id }),
      ),
    }),
  );
  const cheapest = probed
    .filter((result) => hasOpening(result.availability, date))
    .sort((left, right) => compareMoney(left.item.price, right.item.price))[0];

  return {
    browsing: false,
    availability: cheapest?.availability ?? null,
    available: Boolean(cheapest),
    price: cheapest?.item.price ?? null,
    quote: null,
    start: null,
    end: null,
  };
}

function hasOpening(availability: AvailabilityResponse | null, date: string): boolean {
  if (availability?.mode === 'hourly') {
    return availability.days.some((day) => day.slots.some((slot) => slot.available));
  }
  if (availability?.mode === 'daily') {
    return availability.days.some((day) => day.date === date && day.status === 'available');
  }
  return false;
}

/**
 * With a time range chosen the room is bookable only if that exact slot is open, and
 * it is priced by a real quote. With only a day chosen it is bookable if anything is
 * open, priced "from" the cheapest slot.
 */
async function hourlyRoom(
  request: Request,
  slug: string,
  detail: PublicListingDetailWithTimezoneResponse,
  state: StorefrontSearchState,
): Promise<RoomAvailability> {
  const availability = await safe(
    fetchAvailability(request, slug, { mode: 'hourly', from: state.date, to: state.date }),
  );
  const slots =
    availability?.mode === 'hourly' ? availability.days.flatMap((day) => day.slots) : [];
  const openSlots = slots.filter((slot) => slot.available);
  const timezone = availability?.timezone ?? detail.timezone;

  if (!state.hasTimeSelection) {
    return {
      browsing: false,
      availability,
      available: openSlots.length > 0,
      price: minMoney(openSlots.map((slot) => slot.price)),
      quote: null,
      start: null,
      end: null,
    };
  }

  const start = zonedToUtcIso(state.date, state.startTime, timezone);
  const end = zonedToUtcIso(state.date, state.endTime, timezone);
  const requestedSlot = slots.find(
    (slot) => slot.startUtc === start && slot.endUtc === end && slot.available,
  );
  const quote = requestedSlot
    ? await safe(
        fetchQuote(
          request,
          slug,
          new URLSearchParams({ mode: 'hourly', from: start, to: end, quantity: '1' }),
        ),
      )
    : null;

  return {
    browsing: false,
    availability,
    available: Boolean(requestedSlot && quote),
    price: quote?.subtotal ?? null,
    quote,
    start,
    end,
  };
}

/** Bookable when the stay length fits the listing's night bounds and every night is open. */
async function dailyRoom(
  request: Request,
  slug: string,
  detail: PublicListingDetailWithTimezoneResponse,
  state: StorefrontSearchState,
): Promise<RoomAvailability> {
  const config = dailyModeConfig(detail.modeConfig);
  const nights = nightsBetween(state.from, state.to);
  const availability = await safe(
    fetchAvailability(request, slug, {
      mode: 'daily',
      from: state.from,
      // The checkout day is not a night, so it is not part of the availability window.
      to: addDays(state.to, -1),
    }),
  );
  const open = openDailyDates(availability);
  const fits =
    nights >= config.minNights &&
    (config.maxNights === null || nights <= config.maxNights) &&
    rangeDates(state.from, state.to).every((date) => open.has(date));

  const timezone = availability?.timezone ?? detail.timezone;
  const start = zonedToUtcIso(state.from, config.checkinTime, timezone);
  const end = zonedToUtcIso(state.to, config.checkoutTime, timezone);
  const quote = fits
    ? await safe(
        fetchQuote(
          request,
          slug,
          new URLSearchParams({ mode: 'daily', from: start, to: end, quantity: '1' }),
        ),
      )
    : null;

  return {
    browsing: false,
    availability,
    available: Boolean(fits && quote),
    price: quote?.subtotal ?? null,
    quote,
    start,
    end,
  };
}
