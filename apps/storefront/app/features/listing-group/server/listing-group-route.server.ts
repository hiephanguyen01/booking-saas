import { MAX_BOOKING_RANGE_DAYS, moneyStringSchema, timeOfDaySchema } from '@booking/contracts';
import { submitContentReport } from '~/features/content-reports/server/content-report.server';
import { parseSearchState, rangeDates } from '~/features/search/lib/search-state';
import { loadAdministrativeProvinces } from '~/lib/administrative-divisions.server';
import { fetchAvailability } from '~/features/booking/server/booking.server';
import {
  fetchListing,
  fetchListingGroup,
  fetchListings,
  fetchQuote,
} from '~/features/catalog/server/catalog.server';
import { mapWithConcurrency } from '~/lib/concurrency.server';
import { optionalData } from '~/lib/optional-data.server';
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
  const [catalogCandidates, provinces, reviewData] = await Promise.all([
    safe(fetchListings(request, relatedSearch)),
    loadAdministrativeProvinces(request),
    loadPublicReviews(request, url.searchParams, 'group', groupSlug),
  ]);
  const state = parseSearchState(url.searchParams, fallbackToday);
  const fixedPackages = group.bookingSelection === 'fixed_packages';
  const hasAvailabilityFilter = fixedPackages
    ? state.hasDateSelection
    : (state.mode === 'hourly' && state.hasDateSelection) ||
      (state.mode === 'daily' && state.hasDailyRange);
  const options = await mapWithConcurrency(
    group.listings,
    LISTING_DETAIL_CONCURRENCY,
    async (child) => {
      const detail = await safe(fetchListing(request, child.slug));
      if (!detail) return null;
      const bookingToday = todayInTz(detail.timezone, requestNow);
      if (!hasAvailabilityFilter) {
        return {
          child,
          detail,
          bookingToday,
          browsing: true as const,
          availability: null,
          available: null,
          price: child.priceFrom,
          quote: null,
          start: null,
          end: null,
        };
      }
      if (state.mode === 'none') return null;
      if (!detail.bookingModes.includes(state.mode)) return null;
      if (state.mode === 'hourly') {
        if (detail.bookingSelection === 'fixed_packages') {
          const packages = publicPackages(detail.modeConfig.hourly, 'durationMinutes');
          const results = await mapWithConcurrency(
            packages,
            PACKAGE_AVAILABILITY_CONCURRENCY,
            async (item) => ({
              item,
              availability: await safe(
                fetchAvailability(request, child.slug, {
                  mode: 'hourly',
                  from: state.date,
                  to: state.date,
                  packageId: item.id,
                }),
              ),
            }),
          );
          const availableResults = results.flatMap((result) => {
            const slots =
              result.availability?.mode === 'hourly'
                ? result.availability.days
                    .flatMap((day) => day.slots)
                    .filter((slot) => slot.available)
                : [];
            return slots.length ? [{ ...result, slots }] : [];
          });
          const cheapest = availableResults.sort((left, right) =>
            compareMoney(left.item.price, right.item.price),
          )[0];
          return {
            child,
            detail,
            bookingToday,
            browsing: false as const,
            availability: cheapest?.availability ?? null,
            available: Boolean(cheapest),
            price: cheapest?.item.price ?? null,
            quote: null,
            start: null,
            end: null,
          };
        }
        const availability = await safe(
          fetchAvailability(request, child.slug, {
            mode: 'hourly',
            from: state.date,
            to: state.date,
          }),
        );
        const slots =
          availability?.mode === 'hourly' ? availability.days.flatMap((day) => day.slots) : [];
        const openSlots = slots.filter((slot) => slot.available);
        const timezone = availability?.timezone ?? detail.timezone;
        const requestedStart = state.hasTimeSelection
          ? zonedToUtcIso(state.date, state.startTime, timezone)
          : null;
        const requestedEnd = state.hasTimeSelection
          ? zonedToUtcIso(state.date, state.endTime, timezone)
          : null;
        const requestedSlot =
          requestedStart && requestedEnd
            ? slots.find(
                (slot) =>
                  slot.startUtc === requestedStart &&
                  slot.endUtc === requestedEnd &&
                  slot.available,
              )
            : null;
        const quote = requestedSlot
          ? await safe(
              fetchQuote(
                request,
                child.slug,
                new URLSearchParams({
                  mode: 'hourly',
                  from: requestedStart!,
                  to: requestedEnd!,
                  quantity: '1',
                }),
              ),
            )
          : null;
        const price = state.hasTimeSelection
          ? (quote?.subtotal ?? null)
          : openSlots.length
            ? openSlots.reduce(
                (lowest, slot) => (compareMoney(slot.price, lowest) < 0 ? slot.price : lowest),
                openSlots[0]!.price,
              )
            : null;
        return {
          child,
          detail,
          bookingToday,
          browsing: false as const,
          availability,
          available: state.hasTimeSelection
            ? Boolean(requestedSlot && quote)
            : openSlots.length > 0,
          price,
          quote,
          start: requestedStart,
          end: requestedEnd,
        };
      }
      const daily = (detail.modeConfig.daily ?? {}) as Record<string, unknown>;
      if (detail.bookingSelection === 'fixed_packages') {
        const packages = publicPackages(daily, 'durationDays');
        const results = await mapWithConcurrency(
          packages,
          PACKAGE_AVAILABILITY_CONCURRENCY,
          async (item) => ({
            item,
            availability: await safe(
              fetchAvailability(request, child.slug, {
                mode: 'daily',
                from: state.date,
                to: state.date,
                packageId: item.id,
              }),
            ),
          }),
        );
        const cheapest = results
          .filter(
            (result) =>
              result.availability?.mode === 'daily' &&
              result.availability.days.some(
                (day) => day.date === state.date && day.status === 'available',
              ),
          )
          .sort((left, right) => compareMoney(left.item.price, right.item.price))[0];
        return {
          child,
          detail,
          bookingToday,
          browsing: false as const,
          availability: cheapest?.availability ?? null,
          available: Boolean(cheapest),
          price: cheapest?.item.price ?? null,
          quote: null,
          start: null,
          end: null,
        };
      }
      const minNights = Number(daily.minNights ?? 1);
      const maxNights = Number(daily.maxNights ?? Number.POSITIVE_INFINITY);
      const nights = nightsBetween(state.from, state.to);
      const availability = await safe(
        fetchAvailability(request, child.slug, {
          mode: 'daily',
          from: state.from,
          to: addDays(state.to, -1),
        }),
      );
      const open = new Set(
        availability?.mode === 'daily'
          ? availability.days.filter((day) => day.status === 'available').map((day) => day.date)
          : [],
      );
      const available =
        nights >= minNights &&
        nights <= maxNights &&
        rangeDates(state.from, state.to).every((date) => open.has(date));
      const timezone = availability?.timezone ?? detail.timezone;
      const checkinTime = validTime(daily.checkinTime, '14:00');
      const checkoutTime = validTime(daily.checkoutTime, '12:00');
      const roomStart = zonedToUtcIso(state.from, checkinTime, timezone);
      const roomEnd = zonedToUtcIso(state.to, checkoutTime, timezone);
      const quote = available
        ? await safe(
            fetchQuote(
              request,
              child.slug,
              new URLSearchParams({ mode: 'daily', from: roomStart, to: roomEnd, quantity: '1' }),
            ),
          )
        : null;
      return {
        child,
        detail,
        bookingToday,
        browsing: false as const,
        availability,
        available: Boolean(available && quote),
        price: quote?.subtotal ?? null,
        quote,
        start: roomStart,
        end: roomEnd,
      };
    },
  );
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
  return {
    group,
    state: renderedState,
    bookingToday,
    hasAvailabilityFilter,
    roomOptions,
    locations,
    relatedListings,
    ...reviewData,
  };
}

function safe<T>(promise: Promise<T>): Promise<T | null> {
  return optionalData(promise, null);
}

function publicPackages(
  raw: unknown,
  durationKey: 'durationMinutes' | 'durationDays',
): Array<{ id: string; price: string; duration: number }> {
  if (!raw || typeof raw !== 'object') return [];
  const packages = (raw as Record<string, unknown>).packages;
  if (!Array.isArray(packages)) return [];
  return packages.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const row = item as Record<string, unknown>;
    const duration = Number(row[durationKey]);
    const price = moneyStringSchema.safeParse(row.price);
    const validDuration =
      Number.isInteger(duration) &&
      duration > 0 &&
      (durationKey !== 'durationDays' || duration <= MAX_BOOKING_RANGE_DAYS);
    return typeof row.id === 'string' && price.success && validDuration
      ? [{ id: row.id, price: price.data, duration }]
      : [];
  });
}

function validTime(value: unknown, fallback: string): string {
  const parsed = timeOfDaySchema.safeParse(value);
  return parsed.success ? parsed.data : fallback;
}

function compareMoney(left: string, right: string): number {
  const a = BigInt(left);
  const b = BigInt(right);
  return a < b ? -1 : a > b ? 1 : 0;
}
