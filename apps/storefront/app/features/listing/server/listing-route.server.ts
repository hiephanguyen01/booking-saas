import type { AvailabilityMode, PublicListingDetailResponse } from '@booking/contracts';
import { submitContentReport } from '../../content-reports/content-report.server';
import { loadAdministrativeProvinces } from '../../../lib/administrative-divisions.server';
import { fetchAvailability } from '../../../lib/booking.server';
import { fetchListing, fetchListings, fetchQuote } from '../../../lib/catalog.server';
import { canOffsetDateOnly, isValidDateOnly } from '../../../lib/date-only';
import { normalizeDailyRange } from '../../../lib/daily-range';
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
    const anchor = validDateOr(searchParams.get('from'), today, 30);
    availabilityPromise = fetchAvailability(request, listingSlug, {
      mode,
      from: anchor,
      to: addDays(anchor, 30),
      ...(packageId ? { packageId } : {}),
    });
  } else {
    const from = validDateOr(searchParams.get('from'), today);
    const to = validDateOr(searchParams.get('to'), from);
    availabilityPromise = fetchAvailability(request, listingSlug, { mode, from, to });
  }

  const relatedSearch = new URLSearchParams({
    type: listing.listingTypeSlug,
    pageSize: '5',
    sort: 'bookings-desc',
  });
  const locations = provincesPromise
    .then((provinces) =>
      provinces.map((province) => ({ value: province.code, label: province.name })),
    )
    .catch(() => []);
  const relatedPromise =
    listing.bookingSelection === 'fixed_packages'
      ? fetchListings(request, relatedSearch).catch(() => [])
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
    const startTime = searchParams.get('startTime');
    const endTime = searchParams.get('endTime');
    if (
      availability &&
      date &&
      isValidDateOnly(date) &&
      startTime &&
      endTime &&
      startTime < endTime
    ) {
      selectionStart = zonedToUtcIso(date, startTime, availability.timezone);
      selectionEnd = zonedToUtcIso(date, endTime, availability.timezone);
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
  for (let date = range.from; date < range.to; date = addDays(date, 1)) {
    if (!openDates.has(date)) return false;
  }
  return true;
}
