import {
  reviewListResponseSchema,
  type AvailabilityMode,
  type PublicListingDetailResponse,
} from '@booking/contracts';
import type { Route } from './+types/listing';
import { RouteErrorState } from '@booking/ui/components/route-error-state';
import { ListingPage } from '../features/listing/listing-page';
import { loadAdministrativeProvinces } from '../lib/administrative-divisions.server';
import { fetchAvailability } from '../lib/booking.server';
import { fetchListing, fetchListings, fetchQuote } from '../lib/catalog.server';
import { isValidDateOnly } from '../lib/date-only';
import { normalizeDailyRange } from '../lib/daily-range';
import { addDays, DEFAULT_TZ, todayInTz, zonedToUtcIso } from '../lib/time';
import { useOutletContext } from 'react-router';
import type { StorefrontContext } from '../root';
import { jsonLd } from '../lib/seo';
import { publicGetData } from '../lib/api.server';

const BOOKABLE_MODES: AvailabilityMode[] = ['hourly', 'daily', 'inventory'];

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

function validDateOr(value: string | null, fallback: string): string {
  return value && isValidDateOnly(value) ? value : fallback;
}

export function meta({ loaderData }: Route.MetaArgs): Route.MetaDescriptors {
  const listing = loaderData?.listing;
  if (!listing) return [{ title: 'Listing' }];

  const description = listing.description?.slice(0, 200);
  const image = listing.photos[0];
  const tags: Route.MetaDescriptors = [
    { title: listing.title },
    { property: 'og:title', content: listing.title },
    { property: 'og:type', content: 'product' },
  ];

  if (description) {
    tags.push({ name: 'description', content: description });
    tags.push({ property: 'og:description', content: description });
  }

  if (image) tags.push({ property: 'og:image', content: image });
  return tags;
}

export async function loader({ request, params, url }: Route.LoaderArgs) {
  const searchParams = url.searchParams;
  const requestedRating = Number(searchParams.get('rating'));
  const rating =
    Number.isInteger(requestedRating) && requestedRating >= 1 && requestedRating <= 5
      ? requestedRating
      : undefined;
  const reviewRequest = (filterRating?: number) =>
    publicGetData(request, '/public/reviews', {
      query: {
        target: 'listing',
        slug: params.listingSlug,
        page: 1,
        pageSize: 6,
        sort: 'newest',
        ...(filterRating ? { rating: filterRating } : {}),
      },
      schema: reviewListResponseSchema,
    }).catch(() => null);
  const listingPromise = fetchListing(request, params.listingSlug);
  const provincesPromise = loadAdministrativeProvinces(request);
  const reviewsPromise = reviewRequest(rating);
  const unfilteredReviewsPromise = rating ? reviewRequest() : Promise.resolve(null);
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
    availabilityPromise = fetchAvailability(request, params.listingSlug, {
      mode,
      from: day,
      to: day,
      ...(packageId ? { packageId } : {}),
    });
  } else if (mode === 'daily') {
    const anchor = validDateOr(searchParams.get('from'), today);
    availabilityPromise = fetchAvailability(request, params.listingSlug, {
      mode,
      from: anchor,
      to: addDays(anchor, 30),
      ...(packageId ? { packageId } : {}),
    });
  } else {
    const from = validDateOr(searchParams.get('from'), today);
    const to = validDateOr(searchParams.get('to'), from);
    availabilityPromise = fetchAvailability(request, params.listingSlug, { mode, from, to });
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
    listing.listingTypeSlug === 'photography'
      ? fetchListings(request, relatedSearch).catch(() => [])
      : Promise.resolve([]);
  const auxiliaryData = Promise.all([
    reviewsPromise,
    unfilteredReviewsPromise,
    relatedPromise,
  ]).then(([reviews, unfilteredReviews, relatedCandidates]) => ({
    reviews,
    reviewSummary: unfilteredReviews?.summary ?? reviews?.summary ?? null,
    relatedListings: relatedCandidates
      .filter((candidate) => candidate.id !== listing.id)
      .slice(0, 4),
  }));

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
        params.listingSlug,
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
    rating,
  };
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

export default function ListingRoute(props: Route.ComponentProps) {
  const { tenant, locale, canonical } = useOutletContext<StorefrontContext>();
  const listing = props.loaderData.listing;
  const structuredData = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${new URL(canonical).origin}/#organization`,
        name: tenant.name,
        url: new URL(canonical).origin,
        ...(tenant.themeConfig.logoUrl ? { logo: tenant.themeConfig.logoUrl } : {}),
      },
      {
        '@type': 'WebPage',
        '@id': `${canonical}#webpage`,
        url: canonical,
        name: listing.title,
        description: listing.description,
        inLanguage: locale,
        image: listing.photos,
      },
      {
        '@type': 'Service',
        '@id': `${canonical}#service`,
        name: listing.title,
        image: listing.photos,
        provider: { '@id': `${new URL(canonical).origin}/#organization` },
        ...(listing.reviewCount > 0 && listing.ratingAvg !== null
          ? {
              aggregateRating: {
                '@type': 'AggregateRating',
                ratingValue: listing.ratingAvg,
                reviewCount: listing.reviewCount,
                bestRating: 5,
                worstRating: 1,
              },
            }
          : {}),
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: locale === 'vi' ? 'Trang chủ' : 'Home',
            item: new URL(`/${locale}`, canonical).toString(),
          },
          { '@type': 'ListItem', position: 2, name: listing.title, item: canonical },
        ],
      },
    ],
  };
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(structuredData) }}
      />
      <ListingPage {...props} />
    </>
  );
}

export function ErrorBoundary({ error, params }: Route.ErrorBoundaryProps) {
  const locale = params.locale === 'en' ? 'en' : 'vi';
  return <RouteErrorState error={error} homeHref={`/${locale}`} homeLabel="Về trang chủ" />;
}
