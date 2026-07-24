import {
  MAX_BOOKING_RANGE_DAYS,
  availabilityQuerySchema,
  timeOfDaySchema,
  type AvailabilityMode,
  type PublicListingDetailResponse,
} from '@booking/contracts';
import { submitContentReport } from '../../content-reports/content-report.server';
import { loadAdministrativeProvinces } from '../../../lib/administrative-divisions.server';
import { fetchAvailability } from '../../../lib/booking.server';
import { fetchListing, fetchListings, fetchQuote } from '../../../lib/catalog.server';
import { canOffsetDateOnly, isValidDateOnly } from '../../../lib/date-only';
import { datesInDailyRange, normalizeDailyRange } from '../../../lib/daily-range';
import { optionalData } from '../../../lib/optional-data.server';
import { loadPublicReviews } from '../../../lib/public-reviews.server';
import { addDays, DEFAULT_TZ, todayInTz, zonedToUtcIso } from '../../../lib/time';

const BOOKABLE_MODES: AvailabilityMode[] = ['hourly', 'daily', 'inventory'];

export async function handleListingAction(request: Request, listingSlug?: string) {
  return submitContentReport(
    request,
    'listing',
    listingSlug ? ((await fetchListing(request, listingSlug))?.id ?? '') : '',
  );
}

export async function loadListingRoute(request: Request, url: URL, listingSlug: string) {
  const searchParams = url.searchParams;
  const listingPromise = fetchListing(request, listingSlug);
  const provincesPromise = loadAdministrativeProvinces(request);
  const reviewsPromise = loadPublicReviews(request, searchParams, 'listing', listingSlug);
  const listing = await listingPromise;

  if (!listing) {
    throw new Response('Listing not found', { status: 404 });
  }

  const mode = pickMode(searchParams.get('mode'), listing);
  const packageId = searchParams.get('packageId') ?? undefined;
  const requiresPackage = listing.bookingSelection === 'fixed_packages';
  const today = todayInTz(DEFAULT_TZ);
  let availabilityPromise: ReturnType<typeof fetchAvailability> | null = null;

  if (requiresPackage && !packageId) {
    availabilityPromise = null;
  } else if (mode === 'hourly') {
    const day = validDateOr(searchParams.get('day') ?? searchParams.get('date'), today);
    availabilityPromise = fetchAvailability(request, listingSlug, {
      mode,
      from: day,
      to: day,
      ...(packageId ? { packageId } : {}),
    });
  } else if (mode === 'daily') {
    const anchor = validDateOr(
      searchParams.get('from'),
      today,
      MAX_BOOKING_RANGE_DAYS - 1,
    );
    availabilityPromise = fetchAvailability(request, listingSlug, {
      mode,
      from: anchor,
      to: addDays(anchor, MAX_BOOKING_RANGE_DAYS - 1),
      ...(packageId ? { packageId } : {}),
    });
  } else {
    const from = validDateOr(searchParams.get('from'), today, MAX_BOOKING_RANGE_DAYS - 1);
    const candidateTo = validDateOr(searchParams.get('to'), from);
    const parsed = availabilityQuerySchema.safeParse({ mode, from, to: candidateTo });
    const range = parsed.success ? parsed.data : { mode, from, to: from };
    availabilityPromise = fetchAvailability(request, listingSlug, range);
  }

  const relatedSearch = new URLSearchParams({
    type: listing.listingTypeSlug,
    pageSize: '5',
    sort: 'bookings-desc',
  });
  const locations = optionalData(
    provincesPromise.then((provinces) =>
      provinces.map((province) => ({ value: province.code, label: province.name })),
    ),
    [],
  );
  const relatedPromise =
    listing.bookingSelection === 'fixed_packages'
      ? optionalData(fetchListings(request, relatedSearch), [])
      : Promise.resolve([]);
  const auxiliaryData = Promise.all([reviewsPromise, relatedPromise]).then(
    ([reviewData, relatedCandidates]) => ({
      ...reviewData,
      relatedListings: relatedCandidates
        .filter((candidate) => candidate.id !== listing.id)
        .slice(0, 4),
    }),
  );

  const availability = availabilityPromise ? await availabilityPromise : null;

  let selectionStart = searchParams.get('start');
  let selectionEnd = searchParams.get('end');
  const quantity = searchParams.get('qty') || searchParams.get('quantity') || '1';

  if (mode === 'hourly' && (!selectionStart || !selectionEnd)) {
    const date = searchParams.get('date');
    const startTime = timeOfDaySchema.safeParse(searchParams.get('startTime'));
    const endTime = timeOfDaySchema.safeParse(searchParams.get('endTime'));
    if (
      availability &&
      date &&
      isValidDateOnly(date) &&
      startTime.success &&
      endTime.success &&
      startTime.data < endTime.data
    ) {
      selectionStart = zonedToUtcIso(date, startTime.data, availability.timezone);
      selectionEnd = zonedToUtcIso(date, endTime.data, availability.timezone);
    }
  }

  const selectionAvailable =
    selectionStart && selectionEnd
      ? isSelectionAvailable(
          availability,
          mode,
          selectionStart,
          selectionEnd,
          quantity,
          searchParams,
          requiresPackage,
        )
      : false;
  const quote = selectionAvailable
    ? await fetchQuote(
        request,
        listingSlug,
        new URLSearchParams({
          mode,
          from: selectionStart!,
          to: selectionEnd!,
          quantity,
          ...(packageId ? { packageId } : {}),
        }),
      )
    : null;

  return {
    listing,
    mode,
    availability,
    quote,
    locations,
    selectionStart,
    selectionEnd,
    auxiliaryData,
  };
}

function pickMode(
  requested: string | null,
  listing: PublicListingDetailResponse,
): AvailabilityMode {
  const enabled = listing.bookingModes.filter((mode): mode is AvailabilityMode =>
    (BOOKABLE_MODES as string[]).includes(mode),
  );

  if (requested && enabled.includes(requested as AvailabilityMode)) {
    return requested as AvailabilityMode;
  }

  return enabled[0] ?? 'hourly';
}

function validDateOr(value: string | null, fallback: string, offsetDays = 0): string {
  return value && canOffsetDateOnly(value, offsetDays) ? value : fallback;
}

function isSelectionAvailable(
  availability: Awaited<ReturnType<typeof fetchAvailability>> | null,
  mode: AvailabilityMode,
  start: string,
  end: string,
  quantity: string,
  searchParams: URLSearchParams,
  fixedPackage: boolean,
): boolean {
  if (!availability) return false;
  if (mode === 'hourly') {
    return (
      availability.mode === 'hourly' &&
      availability.days.some((day) =>
        day.slots.some((slot) => slot.startUtc === start && slot.endUtc === end && slot.available),
      )
    );
  }
  if (mode === 'inventory') {
    const requested = Number(quantity);
    return (
      availability.mode === 'inventory' &&
      Number.isInteger(requested) &&
      requested > 0 &&
      availability.inventory.remaining >= requested
    );
  }
  if (availability.mode !== 'daily') return false;
  const from = searchParams.get('from');
  if (fixedPackage) {
    return Boolean(
      from &&
      isValidDateOnly(from) &&
      availability.days.some((day) => day.date === from && day.status === 'available'),
    );
  }
  const to = searchParams.get('to');
  const range = normalizeDailyRange(from ?? undefined, to ?? undefined);
  if (!range) return false;
  const openDates = new Set(
    availability.days.filter((day) => day.status === 'available').map((day) => day.date),
  );
  return datesInDailyRange(range).every((date) => openDates.has(date));
}
