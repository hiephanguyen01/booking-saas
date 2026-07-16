import type { PublicListingDetailResponse } from '@booking/contracts';
import { Badge } from '@booking/ui/components/ui/badge';
import { Link, useOutletContext, useSearchParams } from 'react-router';
import { Separator } from '@booking/ui/components/ui/separator';
import { NsI18n, useTranslation } from '../../lib/i18n';
import type { Route } from '../../routes/+types/listing';
import { BookingPanel } from '../../templates/studio/booking-panel';
import { storefrontPaths } from '../../lib/locale-paths';
import { useLocale } from '../../lib/use-locale';
import { formatListingLocation } from '../../lib/ui';
import { MapPin, ShieldCheck } from 'lucide-react';
import type { StorefrontContext } from '../../root';
import { SearchForm } from '../search/search-form';
import { parseSearchState } from '../search/search-state';

export function ListingPage({ loaderData, params }: Route.ComponentProps) {
  const { listing, mode, availability, quote } = loaderData;
  const { t } = useTranslation(NsI18n.Listing);
  const locale = useLocale();
  const { listingTypes } = useOutletContext<StorefrontContext>();
  const [searchParams] = useSearchParams();

  if (!listing) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-24 text-center text-muted-foreground">
        {t('notFound', { slug: params.listingSlug })}
      </div>
    );
  }

  const attrs = Object.entries(listing.attributes).filter(
    ([, v]) => v !== null && v !== '' && typeof v !== 'boolean',
  );
  const location = formatListingLocation(listing, 'full');

  return (
    <div className="bg-muted/20 pb-20">
      <SearchForm
        listingTypes={listingTypes}
        currentType={listing.listingTypeSlug}
        initialState={parseSearchState(searchParams)}
        variant="bar"
      />
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-4">
          {listing.group ? (
            <Link
              to={storefrontPaths.listingGroup(locale, listing.group.slug)}
              className="mb-2 inline-flex text-sm text-muted-foreground hover:text-foreground"
            >
              ← {listing.group.title}
            </Link>
          ) : null}
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{listing.title}</h1>
          {location ? (
            <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
              <MapPin className="size-4 shrink-0" aria-hidden="true" />
              {location}
            </p>
          ) : null}
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
            {attrs.length > 0 ? <ListingAttributes attrs={attrs} /> : null}
          </div>

          <div>
            <BookingPanel listing={listing} mode={mode} availability={availability} quote={quote} />
          </div>
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
  const { t } = useTranslation(NsI18n.Listing);
  const since = activeSinceLabel(trust.partnerActiveSince);
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
      <span className="font-medium text-foreground">
        {t('providedBy', { name: trust.partnerName })}
      </span>
      {trust.identityVerified ? (
        <Badge className="gap-1 rounded-full px-2.5 py-0.5">
          <ShieldCheck className="size-3.5" aria-hidden="true" />
          {t('identityVerified')}
        </Badge>
      ) : null}
      {since ? (
        <Badge variant="secondary" className="rounded-full px-2.5 py-0.5 font-normal">
          {t('activeSince', { date: since })}
        </Badge>
      ) : null}
      {trust.completedBookings > 0 ? (
        <Badge variant="secondary" className="rounded-full px-2.5 py-0.5 font-normal">
          {t('completedBookings', { count: trust.completedBookings })}
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
