import type { AvailabilityMode, PublicListingDetailResponse } from '@booking/contracts';
import type { Route } from './+types/listing';
import { RouteErrorState } from '@booking/ui/components/route-error-state';
import { ListingPage } from '../features/listing/listing-page';
import { loadAdministrativeProvinces } from '../lib/administrative-divisions.server';
import { fetchAvailability } from '../lib/booking.server';
import { fetchListing, fetchQuote } from '../lib/catalog.server';
import { normalizeDailyRange } from '../lib/daily-range';
import { addDays, DEFAULT_TZ, todayInTz, zonedToUtcIso } from '../lib/time';
import { useOutletContext } from 'react-router';
import type { StorefrontContext } from '../root';
import { jsonLd } from '../lib/seo';

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
  const [listing, provinces] = await Promise.all([
    fetchListing(request, params.listingSlug),
    loadAdministrativeProvinces(request),
  ]);

  if (!listing) {
    throw new Response('Listing not found', { status: 404 });
  }

  const mode = pickMode(searchParams.get('mode'), listing);
  const today = todayInTz(DEFAULT_TZ);
  let availabilityPromise: ReturnType<typeof fetchAvailability>;

  if (mode === 'hourly') {
    const day = searchParams.get('day') || searchParams.get('date') || today;
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

  const availability = await availabilityPromise;
  let selectionStart = searchParams.get('start');
  let selectionEnd = searchParams.get('end');
  const quantity = searchParams.get('qty') || searchParams.get('quantity') || '1';

  if (mode === 'hourly' && (!selectionStart || !selectionEnd)) {
    const date = searchParams.get('date');
    const startTime = searchParams.get('startTime');
    const endTime = searchParams.get('endTime');
    if (date && startTime && endTime && startTime < endTime) {
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
        }),
      )
    : null;
  const locations = provinces.map((province) => ({
    value: province.code,
    label: province.name,
  }));
  return { listing, mode, availability, quote, locations, selectionStart, selectionEnd };
}

function isSelectionAvailable(
  availability: Awaited<ReturnType<typeof fetchAvailability>>,
  mode: AvailabilityMode,
  start: string,
  end: string,
  quantity: string,
  searchParams: URLSearchParams,
): boolean {
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
