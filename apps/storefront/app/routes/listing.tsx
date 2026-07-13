import type { AvailabilityMode, PublicListingDetailResponse } from '@booking/shared';
import { Badge } from '@booking/ui/components/ui/badge';
import { Separator } from '@booking/ui/components/ui/separator';
import type { Route } from './+types/listing';
import { fetchListing, fetchQuote } from '../lib/catalog.server';
import { fetchAvailability } from '../lib/booking.server';
import { addDays, todayInTz, DEFAULT_TZ } from '../lib/time';
import { useT } from '../lib/i18n';
import { BookingPanel } from '../templates/studio/booking-panel';

const BOOKABLE_MODES: AvailabilityMode[] = ['hourly', 'daily', 'inventory'];

export function meta({ data }: Route.MetaArgs) {
  const listing = data?.listing;
  if (!listing) return [{ title: 'Listing' }];
  const description = listing.description?.slice(0, 200) ?? undefined;
  const image = listing.photos[0];
  const tags: Array<Record<string, string>> = [
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

/** Pick the active booking mode from the query, constrained to the listing's enabled bookable modes. */
function pickMode(requested: string | null, listing: PublicListingDetailResponse): AvailabilityMode {
  const enabled = listing.bookingModes.filter((m): m is AvailabilityMode =>
    (BOOKABLE_MODES as string[]).includes(m),
  );
  if (requested && enabled.includes(requested as AvailabilityMode)) return requested as AvailabilityMode;
  return enabled[0] ?? 'hourly';
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const sp = new URL(request.url).searchParams;
  const listing = await fetchListing(request, params.listingSlug);
  if (!listing) {
    return { listing: null, mode: 'hourly' as AvailabilityMode, availability: null, quote: null };
  }

  const mode = pickMode(sp.get('mode'), listing);
  const tz = DEFAULT_TZ; // resource tz is echoed back on the availability response
  const today = todayInTz(tz);

  let availabilityP: ReturnType<typeof fetchAvailability>;
  if (mode === 'hourly') {
    const day = sp.get('day') || today;
    availabilityP = fetchAvailability(request, params.listingSlug, { mode, from: day, to: day });
  } else if (mode === 'daily') {
    // A 31-day window from the anchor day powers the range calendar.
    const anchor = sp.get('from') || today;
    availabilityP = fetchAvailability(request, params.listingSlug, {
      mode,
      from: anchor,
      to: addDays(anchor, 30),
    });
  } else {
    const from = (sp.get('from') || today).slice(0, 10);
    const to = (sp.get('to') || from).slice(0, 10);
    availabilityP = fetchAvailability(request, params.listingSlug, { mode, from, to });
  }

  // Live quote once a concrete slot is chosen (start/end are UTC ISO instants).
  // Independent of availability, so the two run concurrently.
  const start = sp.get('start');
  const end = sp.get('end');
  const quantity = sp.get('qty') || '1';
  const quoteP =
    start && end
      ? fetchQuote(request, params.listingSlug, new URLSearchParams({ mode, from: start, to: end, quantity }))
      : Promise.resolve(null);

  const [availability, quote] = await Promise.all([availabilityP, quoteP]);

  return { listing, mode, availability, quote };
}

export default function ListingDetail({ loaderData, params }: Route.ComponentProps) {
  const { listing, mode, availability, quote } = loaderData;
  const { t } = useT();

  if (!listing) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-24 text-center text-muted-foreground">
        {t('listing.notFound', { slug: params.listingSlug })}
      </div>
    );
  }

  const attrs = Object.entries(listing.attributes).filter(
    ([, v]) => v !== null && v !== '' && typeof v !== 'boolean',
  );

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-4">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{listing.title}</h1>
        {attrs.length > 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">
            {attrs.map(([, v]) => String(v)).join(' · ')}
          </p>
        ) : null}
        <TrustSignals trust={listing.trust} />
      </div>

      <Gallery photos={listing.photos} title={listing.title} />

      <div className="mt-10 grid grid-cols-1 gap-10 lg:grid-cols-[1fr_400px]">
        <div>
          {listing.description ? (
            <p className="text-[15px] leading-relaxed text-foreground">{listing.description}</p>
          ) : null}
          {attrs.length > 0 ? (
            <ListingAttributes attrs={attrs} />
          ) : null}
        </div>

        <div>
          <BookingPanel listing={listing} mode={mode} availability={availability} quote={quote} />
        </div>
      </div>
    </div>
  );
}

function ListingAttributes({ attrs }: { attrs: [string, unknown][] }) {
  return (
    <>
      <Separator className="my-6" />
      <div className="flex flex-wrap gap-2">
        {attrs.map(([key, value]) => (
          <Badge key={key} variant="secondary" className="rounded-full px-3 py-1 font-normal">
            {key}: {String(value)}
          </Badge>
        ))}
      </div>
    </>
  );
}

function TrustSignals({ trust }: { trust: PublicListingDetailResponse['trust'] }) {
  const { t } = useT();
  const since = activeSinceLabel(trust.partnerActiveSince);
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
      <span className="font-medium text-foreground">{t('listing.providedBy', { name: trust.partnerName })}</span>
      {trust.identityVerified ? (
        <Badge className="gap-1 rounded-full bg-emerald-600 px-2.5 py-0.5 text-white hover:bg-emerald-600">
          <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M12 3l7 4v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V7l7-4z" />
          </svg>
          {t('listing.identityVerified')}
        </Badge>
      ) : null}
      {since ? (
        <Badge variant="secondary" className="rounded-full px-2.5 py-0.5 font-normal">
          {t('listing.activeSince', { date: since })}
        </Badge>
      ) : null}
      {trust.completedBookings > 0 ? (
        <Badge variant="secondary" className="rounded-full px-2.5 py-0.5 font-normal">
          {t('listing.completedBookings', { count: trust.completedBookings })}
        </Badge>
      ) : null}
    </div>
  );
}

function activeSinceLabel(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getUTCMonth() + 1}/${d.getUTCFullYear()}`;
}

function Gallery({ photos, title }: { photos: string[]; title: string }) {
  if (photos.length === 0) {
    return (
      <div className="flex aspect-[16/9] w-full items-center justify-center rounded-3xl bg-muted text-muted-foreground">
        {title}
      </div>
    );
  }
  const [cover, ...rest] = photos;
  return (
    <div className="overflow-hidden rounded-3xl">
      <div className="grid gap-2 md:h-[440px] md:grid-cols-4 md:grid-rows-2">
        <img
          src={cover}
          alt={title}
          className="aspect-[4/3] w-full object-cover md:col-span-2 md:row-span-2 md:aspect-auto md:h-full"
        />
        {rest.slice(0, 4).map((src, i) => (
          <img key={i} src={src} alt="" className="hidden h-full w-full object-cover md:block" />
        ))}
      </div>
    </div>
  );
}
