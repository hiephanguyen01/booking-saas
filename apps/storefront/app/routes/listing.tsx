import type { AvailabilityMode, PublicListingDetailResponse } from '@booking/contracts';
import type { Route } from './+types/listing';
import { RouteErrorState } from '@booking/ui/components/route-error-state';
import { ListingPage } from '../features/listing/listing-page';
import { fetchAvailability } from '../lib/booking.server';
import { fetchListing, fetchQuote } from '../lib/catalog.server';
import { addDays, DEFAULT_TZ, todayInTz } from '../lib/time';

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
  const listing = await fetchListing(request, params.listingSlug);

  if (!listing) {
    throw new Response('Listing not found', { status: 404 });
  }

  const mode = pickMode(searchParams.get('mode'), listing);
  const today = todayInTz(DEFAULT_TZ);
  let availabilityPromise: ReturnType<typeof fetchAvailability>;

  if (mode === 'hourly') {
    const day = searchParams.get('day') || today;
    availabilityPromise = fetchAvailability(request, params.listingSlug, {
      mode,
      from: day,
      to: day,
    });
  } else if (mode === 'daily') {
    const anchor = searchParams.get('from') || today;
    availabilityPromise = fetchAvailability(request, params.listingSlug, {
      mode,
      from: anchor,
      to: addDays(anchor, 30),
    });
  } else {
    const from = (searchParams.get('from') || today).slice(0, 10);
    const to = (searchParams.get('to') || from).slice(0, 10);
    availabilityPromise = fetchAvailability(request, params.listingSlug, { mode, from, to });
  }

  const start = searchParams.get('start');
  const end = searchParams.get('end');
  const quantity = searchParams.get('qty') || '1';
  const quotePromise = start && end
    ? fetchQuote(
        request,
        params.listingSlug,
        new URLSearchParams({ mode, from: start, to: end, quantity }),
      )
    : Promise.resolve(null);

  const [availability, quote] = await Promise.all([availabilityPromise, quotePromise]);
  return { listing, mode, availability, quote };
}

export default function ListingRoute(props: Route.ComponentProps) {
  return <ListingPage {...props} />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return <RouteErrorState error={error} homeHref="/" homeLabel="Về trang chủ" />;
}
