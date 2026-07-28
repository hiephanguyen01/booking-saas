import { Button } from '@booking/ui/components/ui/button';
import { MapPin } from 'lucide-react';
import { Suspense } from 'react';
import { Await, useOutletContext } from 'react-router';
import { ListingRatingSummary } from '~/components/listing-rating-summary';
import { RelatedListingsSkeleton, ReviewsSectionSkeleton } from '~/components/loading-skeletons';
import { PublicReviewsSection } from '~/components/public-reviews-section';
import { SectionCard } from '~/components/section-card';
import { NsI18n, useTranslation } from '~/lib/i18n';
import { formatListingLocation, formatVnd } from '~/lib/ui';
import type { StorefrontContext } from '~/root';
import type { Route } from '../../../routes/+types/listing';
import { ExpandableDescription } from '~/components/expandable-description';
import { HeaderActions } from '~/components/header-actions';
import { ProviderCard } from '~/components/provider-card';
import { StudioGallery } from '~/components/studio-gallery';
import { DeferredSearchBar } from '~/features/search/components/deferred-search-bar';
import { PackageAlbums } from './package-albums';
import { PackageBookingDialog } from './package-booking-dialog';
import { listingPackages, minimumPackagePrice } from '~/features/packages/lib/package-data';
import { PackageTable } from './package-table';
import { RelatedListings } from './related-listings';
import { usePackageBookingController } from './use-package-booking-controller';

export function PackageListingPage({
  loaderData,
}: {
  loaderData: Route.ComponentProps['loaderData'];
}) {
  const { listing, locations, auxiliaryData, bookingToday } = loaderData;
  const { listingTypes, locale } = useOutletContext<StorefrontContext>();
  const { t } = useTranslation([NsI18n.Listing, NsI18n.Common]);
  const packages = listingPackages(listing);
  const {
    bookingOpen,
    selectedPackage,
    galleryPhotos,
    bookingTriggerRef,
    selectPackage,
    changeBookingOpen,
  } = usePackageBookingController(packages, listing.photos);
  const minimumPrice = minimumPackagePrice(packages);
  const location = formatListingLocation(listing, 'full');

  return (
    <div className="font-studio overflow-x-clip bg-muted/40 pb-20 text-foreground">
      <DeferredSearchBar
        listingTypes={listingTypes}
        currentType={listing.listingTypeSlug}
        locations={locations}
        today={bookingToday}
      />

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
            <PackageAlbums
              packages={packages}
              fallbackPhotos={listing.photos}
              title={listing.title}
              listing={listing}
            />
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

        <Suspense
          fallback={
            <div className="space-y-4">
              <ReviewsSectionSkeleton label={t('common:loading')} />
              <RelatedListingsSkeleton label={t('common:loading')} />
            </div>
          }
        >
          <Await resolve={auxiliaryData}>
            {({ reviews, reviewSummary, reviewRating, reviewLimit, relatedListings }) => (
              <>
                <PublicReviewsSection
                  reviews={reviews}
                  summary={reviewSummary}
                  locale={locale}
                  selectedRating={reviewRating}
                  visibleLimit={reviewLimit}
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
        today={bookingToday}
      />
    </div>
  );
}
