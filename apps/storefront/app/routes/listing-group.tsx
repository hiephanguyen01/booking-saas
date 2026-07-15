import { useOutletContext } from 'react-router';
import { RouteErrorState } from '@booking/ui/components/route-error-state';
import type { Route } from './+types/listing-group';
import { fetchListing, fetchListingGroup, fetchListings, fetchQuote } from '../lib/catalog.server';
import { fetchAvailability } from '../lib/booking.server';
import { storefrontPaths } from '../lib/locale-paths';
import type { StorefrontContext } from '../root';
import { jsonLd } from '../lib/seo';
import { parseSearchState, rangeDates } from '../features/search/search-state';
import { addDays, nightsBetween, zonedToUtcIso } from '../lib/time';
import { ListingGroupPage } from '../features/listing-group/listing-group-page';
import { deriveLocationSuggestions } from '../lib/search.server';

export function meta({ loaderData }: Route.MetaArgs): Route.MetaDescriptors {
  const group = loaderData?.group;
  if (!group) return [{ title: 'Bài đăng' }];
  const description = group.description?.slice(0, 180) ?? group.title;
  const tags: Route.MetaDescriptors = [
    { title: group.title },
    { name: 'description', content: description },
    { property: 'og:title', content: group.title },
    { property: 'og:description', content: description },
    { property: 'og:type', content: 'website' },
  ];
  if (group.photos[0]) tags.push({ property: 'og:image', content: group.photos[0] });
  return tags;
}

async function safe<T>(promise: Promise<T>): Promise<T | null> {
  try { return await promise; } catch { return null; }
}

export async function loader({ request, params, url }: Route.LoaderArgs) {
  const [group, catalogCandidates] = await Promise.all([
    fetchListingGroup(request, params.groupSlug),
    safe(fetchListings(request, new URLSearchParams())),
  ]);
  if (!group) throw new Response('Listing group not found', { status: 404 });
  const suggestedLocations = catalogCandidates
    ? await safe(deriveLocationSuggestions(request, catalogCandidates))
    : null;
  const state = parseSearchState(url.searchParams);
  const children = group.listings.slice(0, 20);
  const options = await Promise.all(children.map(async (child) => {
    const detail = await safe(fetchListing(request, child.slug));
    if (!detail || !detail.bookingModes.includes(state.mode)) return null;
    if (state.mode === 'hourly') {
      const availability = await safe(fetchAvailability(request, child.slug, { mode: 'hourly', from: state.date, to: state.date }));
      const slots = availability?.mode === 'hourly' ? availability.days.flatMap((day) => day.slots).filter((slot) => slot.available) : [];
      const price = slots.length ? String(Math.min(...slots.map((slot) => Number(slot.price)))) : null;
      return { child, detail, availability, available: slots.length > 0, price, quote: null, start: null, end: null };
    }
    const daily = (detail.modeConfig.daily ?? {}) as Record<string, unknown>;
    const minNights = Number(daily.minNights ?? 1);
    const maxNights = Number(daily.maxNights ?? Number.POSITIVE_INFINITY);
    const nights = nightsBetween(state.from, state.to);
    const availability = await safe(fetchAvailability(request, child.slug, { mode: 'daily', from: state.from, to: addDays(state.to, -1) }));
    const open = new Set(availability?.mode === 'daily' ? availability.days.filter((day) => day.status === 'available').map((day) => day.date) : []);
    const available = nights >= minNights && nights <= maxNights && rangeDates(state.from, state.to).every((date) => open.has(date));
    const timezone = availability?.timezone ?? 'Asia/Ho_Chi_Minh';
    const checkinTime = typeof daily.checkinTime === 'string' ? daily.checkinTime : '14:00';
    const checkoutTime = typeof daily.checkoutTime === 'string' ? daily.checkoutTime : '12:00';
    const roomStart = zonedToUtcIso(state.from, checkinTime, timezone);
    const roomEnd = zonedToUtcIso(state.to, checkoutTime, timezone);
    const quote = available ? await safe(fetchQuote(request, child.slug, new URLSearchParams({ mode: 'daily', from: roomStart, to: roomEnd, quantity: '1' }))) : null;
    return { child, detail, availability, available: Boolean(available && quote), price: quote?.subtotal ?? null, quote, start: roomStart, end: roomEnd };
  }));
  const roomOptions = options.filter((option): option is NonNullable<typeof option> => option !== null);
  const locations = [...new Set([
    ...(suggestedLocations ?? []),
    group.workingArea,
    group.address,
  ].filter((value): value is string => Boolean(value)))];
  const childIds = new Set(group.listings.map((listing) => listing.id));
  const relatedListings = (catalogCandidates ?? [])
    .filter((listing) => (
      listing.id !== group.id
      && !childIds.has(listing.id)
      && listing.listingTypeSlug === group.listingTypeSlug
    ))
    .slice(0, 4);
  return {
    group,
    state,
    roomOptions,
    locations,
    relatedListings,
  };
}

export default function ListingGroupRoute({ loaderData, params }: Route.ComponentProps) {
  const { group } = loaderData;
  const { tenant, canonical } = useOutletContext<StorefrontContext>();
  const locale = params.locale === 'en' ? 'en' : 'vi';
  const structuredData = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'Organization', '@id': `${new URL(canonical).origin}/#organization`, name: tenant.name, url: new URL(canonical).origin },
      {
        '@type': 'CollectionPage',
        '@id': `${canonical}#webpage`,
        url: canonical,
        name: group.title,
        description: group.description,
        image: group.photos,
        hasPart: group.listings.map((listing) => ({ '@type': 'Service', name: listing.title, url: new URL(storefrontPaths.listing(locale, listing.slug), canonical).toString() })),
      },
      { '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: locale === 'vi' ? 'Trang chủ' : 'Home', item: new URL(`/${locale}`, canonical).toString() }, { '@type': 'ListItem', position: 2, name: group.title, item: canonical }] },
    ],
  };
  return <><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(structuredData) }} /><ListingGroupPage loaderData={loaderData} /></>;
}

export function ErrorBoundary({ error, params }: Route.ErrorBoundaryProps) { const locale = params.locale === 'en' ? 'en' : 'vi'; return <RouteErrorState error={error} homeHref={`/${locale}`} homeLabel="Về trang chủ" />; }
