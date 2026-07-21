import { ImageIcon, MapPin, Ruler, Sparkles, Users } from 'lucide-react';
import { Suspense } from 'react';
import { Await, Link, useOutletContext, useSearchParams } from 'react-router';
import { ListingRatingSummary } from '../../components/listing-rating-summary';
import { PublicReviewsSection } from '../../components/public-reviews-section';
import { SectionCard } from '../../components/section-card';
import { NsI18n, useTranslation } from '../../lib/i18n';
import { storefrontPaths } from '../../lib/locale-paths';
import { formatListingLocation } from '../../lib/ui';
import { useLocale } from '../../lib/use-locale';
import { selectedPackageForListing } from '../../lib/package-options';
import type { StorefrontContext } from '../../root';
import type { Route } from '../../routes/+types/listing';
import { BookingPanel } from '../../templates/studio/booking-panel';
import { ExpandableDescription } from '../listing-group/components/expandable-description';
import { HeaderActions } from '../listing-group/components/header-actions';
import { ProviderCard } from '../listing-group/components/provider-card';
import { StudioGallery } from '../listing-group/components/studio-gallery';
import { roomAttributes, roomCapacity } from '../listing-group/room-attributes';
import { SearchForm } from '../search/search-form';
import { parseSearchState } from '../search/search-state';
import { PackageListingPage } from '../packages/package-listing-page';

export function ListingPage({ loaderData, params }: Route.ComponentProps) {
  const { listing, mode, availability, quote, locations, selectionStart, selectionEnd } =
    loaderData;
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

  if (listing.bookingSelection === 'fixed_packages') {
    return <PackageListingPage loaderData={loaderData} />;
  }

  const location = formatListingLocation(listing, 'full');
  const selectedPackage = selectedPackageForListing(listing, mode, searchParams.get('packageId'));
  const galleryPhotos = selectedPackage?.photos.length ? selectedPackage.photos : listing.photos;
  const mapsHref = location
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`
    : null;

  return (
    <div className="font-studio overflow-x-clip bg-muted/30 pb-20 text-foreground">
      <Suspense fallback={<div className="h-39 bg-foreground" />}>
        <Await resolve={locations}>
          {(resolvedLocations) => (
            <SearchForm
              key={searchParams.toString()}
              listingTypes={listingTypes}
              currentType={listing.listingTypeSlug}
              initialState={parseSearchState(searchParams)}
              locations={resolvedLocations}
              variant="bar"
            />
          )}
        </Await>
      </Suspense>
      <div className="mx-auto flex max-w-292.5 flex-col gap-4 px-4 py-4 xl:px-0">
        <SectionCard>
          <header className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              {listing.group ? (
                <Link
                  to={storefrontPaths.listingGroup(locale, listing.group.slug)}
                  className="mb-2 inline-flex text-sm text-muted-foreground hover:text-foreground"
                >
                  ← {listing.group.title}
                </Link>
              ) : null}
              <h1 className="text-xl font-semibold leading-tight md:text-2xl">{listing.title}</h1>
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground sm:text-sm">
                <ListingRatingSummary
                  ratingAvg={listing.ratingAvg}
                  reviewCount={listing.reviewCount}
                />
                {location ? (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="size-4" aria-hidden="true" />
                    {location}
                  </span>
                ) : null}
                {mapsHref ? (
                  <a
                    href={mapsHref}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {t('group.viewMap')}
                  </a>
                ) : null}
              </div>
            </div>
            <HeaderActions title={listing.title} favorite={{ kind: 'listing', id: listing.id }} />
          </header>
          <StudioGallery
            key={selectedPackage?.id ?? 'listing'}
            photos={galleryPhotos}
            title={selectedPackage ? `${listing.title} — ${selectedPackage.name}` : listing.title}
          />
        </SectionCard>

        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,870px)_284px]">
          <div className="flex min-w-0 flex-col gap-4">
            <SectionCard aria-labelledby="introduction-title">
              <h2 id="introduction-title" className="text-base font-semibold">
                {t('group.introduction')}
              </h2>
              <ExpandableDescription description={listing.description} />
            </SectionCard>

            <ListingDetails attributes={listing.attributes} />
            <Suspense fallback={null}>
              <Await resolve={loaderData.auxiliaryData}>
                {({ reviews }) => <PublicReviewsSection reviews={reviews} locale={locale} />}
              </Await>
            </Suspense>
          </div>

          <aside className="flex flex-col gap-4 lg:sticky lg:top-24">
            <ProviderCard trust={listing.trust} />

            <BookingPanel
              listing={listing}
              mode={mode}
              availability={availability}
              quote={quote}
              initialStart={selectionStart}
              initialEnd={selectionEnd}
            />
          </aside>
        </div>
      </div>
    </div>
  );
}
function ListingDetails({ attributes }: { attributes: Record<string, unknown> }) {
  const { t } = useTranslation(NsI18n.Listing);
  const details = roomAttributes(attributes);
  const capacity = roomCapacity(attributes);
  const items = [
    ...(capacity
      ? [{ key: 'capacity', label: t('group.maxGuests', { count: capacity }), Icon: Users }]
      : []),
    ...details.map((detail, index) => ({
      key: detail.key,
      label: detail.kind === 'area' ? t('group.area', { value: detail.value }) : detail.label,
      Icon: index === 0 ? Ruler : index === 1 ? ImageIcon : Sparkles,
    })),
  ];

  if (!items.length) return null;

  return (
    <SectionCard aria-labelledby="listing-details-title">
      <h2 id="listing-details-title" className="text-base font-semibold">
        {t('info')}
      </h2>
      <div className="mt-5 grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map(({ key, label, Icon }) => (
          <div key={key} className="flex min-w-0 items-center gap-2.5 text-sm">
            <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span>{label}</span>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
