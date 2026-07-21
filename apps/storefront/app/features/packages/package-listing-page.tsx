import { Button } from '@booking/ui/components/ui/button';
import { MapPin } from 'lucide-react';
import { Suspense, useRef, useState } from 'react';
import { Await, useOutletContext, useSearchParams } from 'react-router';
import { ListingRatingSummary } from '../../components/listing-rating-summary';
import { SectionCard } from '../../components/section-card';
import { NsI18n, useTranslation } from '../../lib/i18n';
import { formatListingLocation, formatVnd } from '../../lib/ui';
import type { StorefrontContext } from '../../root';
import type { Route } from '../../routes/+types/listing';
import { ExpandableDescription } from '../listing-group/components/expandable-description';
import { HeaderActions } from '../listing-group/components/header-actions';
import { ProviderCard } from '../listing-group/components/provider-card';
import { StudioGallery } from '../listing-group/components/studio-gallery';
import { SearchForm } from '../search/search-form';
import { parseSearchState } from '../search/search-state';
import { PackageAlbums } from './package-albums';
import { PackageBookingDialog } from './package-booking-dialog';
import { listingPackages, minimumPackagePrice } from './package-data';
import { PackageTable } from './package-table';
import { PackageReviews } from './package-reviews';
import { RelatedListings } from './related-listings';

const STALE_SELECTION_PARAMS = [
  'day',
  'date',
  'start',
  'end',
  'startTime',
  'endTime',
  'from',
  'to',
  'qty',
  'quantity',
] as const;

export function PackageListingPage({
  loaderData,
}: {
  loaderData: Route.ComponentProps['loaderData'];
}) {
  const { listing, locations, auxiliaryData, rating } = loaderData;
  const { listingTypes, locale } = useOutletContext<StorefrontContext>();
  const { t } = useTranslation(NsI18n.Listing);
  const [searchParams, setSearchParams] = useSearchParams();
  const [bookingOpen, setBookingOpen] = useState(false);
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);
  const bookingTriggerRef = useRef<HTMLButtonElement | null>(null);
  const packages = listingPackages(listing);
  const selectedPackage = packages.find((item) => item.id === selectedPackageId) ?? null;
  const minimumPrice = minimumPackagePrice(packages);
  const location = formatListingLocation(listing, 'full');
  const galleryPhotos = selectedPackage?.photos.length ? selectedPackage.photos : listing.photos;

  function selectPackage(packageId: string, trigger: HTMLButtonElement): void {
    bookingTriggerRef.current = trigger;
    setSelectedPackageId(packageId);
    const next = new URLSearchParams(searchParams);
    next.set('packageId', packageId);
    for (const key of STALE_SELECTION_PARAMS) next.delete(key);
    setBookingOpen(true);
    setSearchParams(next, { preventScrollReset: true });
  }

  function changeBookingOpen(open: boolean): void {
    setBookingOpen(open);
    if (open) return;
    setSelectedPackageId(null);

    const next = new URLSearchParams(searchParams);
    next.delete('packageId');
    for (const key of STALE_SELECTION_PARAMS) next.delete(key);
    setSearchParams(next, { preventScrollReset: true });
  }

  return (
    <div className="font-studio overflow-x-clip bg-muted/40 pb-20 text-foreground">
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

      <main className="mx-auto flex max-w-292.5 flex-col gap-4 px-4 py-6 xl:px-0">
        <SectionCard>
          <header className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h1 className="text-2xl leading-tight font-semibold">{listing.title}</h1>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
                {location ? (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="size-5" aria-hidden="true" />
                    {location}
                  </span>
                ) : null}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted-foreground">
                <ListingRatingSummary
                  ratingAvg={listing.ratingAvg}
                  reviewCount={listing.reviewCount}
                />
                {listing.trust.completedBookings > 0 ? (
                  <span className="border-l pl-3">
                    {t('bookedCount', { count: listing.trust.completedBookings })}
                  </span>
                ) : null}
              </div>
            </div>
            <HeaderActions title={listing.title} favorite={{ kind: 'listing', id: listing.id }} />
          </header>
          <StudioGallery
            key={selectedPackage?.id ?? 'packages'}
            photos={galleryPhotos}
            title={selectedPackage ? `${listing.title} — ${selectedPackage.name}` : listing.title}
          />
        </SectionCard>

        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,870px)_284px]">
          <div className="flex min-w-0 flex-col gap-4">
            <SectionCard aria-labelledby="packages-introduction-title">
              <h2 id="packages-introduction-title" className="text-base font-semibold">
                {t('group.introduction')}
              </h2>
              <ExpandableDescription description={listing.description} />
            </SectionCard>
            <PackageAlbums packages={packages} fallbackPhotos={listing.photos} title={listing.title} />
          </div>

          <aside className="flex flex-col gap-4 lg:sticky lg:top-24">
            <div className="rounded-lg bg-card p-5 text-right text-card-foreground shadow-sm">
              {minimumPrice ? (
                <p className="text-sm text-muted-foreground">
                  {t('fromPriceShort')}{' '}
                  <strong className="text-xl text-primary">{formatVnd(minimumPrice)}</strong>
                </p>
              ) : (
                <p className="font-semibold">{t('pickScheduleForPrice')}</p>
              )}
              <p className="mt-1 text-xs text-muted-foreground">{t('perSession')}</p>
              <Button asChild className="mt-5 w-full">
                <a href="#packages">{t('packages.viewPackages')}</a>
              </Button>
            </div>
            <ProviderCard trust={listing.trust} />
          </aside>
        </div>

        <PackageTable
          listing={listing}
          packages={packages}
          selectedId={selectedPackage?.id ?? null}
          onSelect={selectPackage}
        />

        <Suspense fallback={null}>
          <Await resolve={auxiliaryData}>
            {({ reviews, reviewSummary, relatedListings }) => (
              <>
                <PackageReviews
                  reviews={reviews}
                  summary={reviewSummary}
                  locale={locale}
                  selectedRating={rating}
                />
                <RelatedListings listings={relatedListings} />
              </>
            )}
          </Await>
        </Suspense>
      </main>

      <PackageBookingDialog
        open={bookingOpen}
        onOpenChange={changeBookingOpen}
        returnFocusRef={bookingTriggerRef}
        selectedPackage={selectedPackage}
        listing={listing}
      />
    </div>
  );
}
