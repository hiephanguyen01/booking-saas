import { Button } from '@booking/ui/components/ui/button';
import { MapPin } from 'lucide-react';
import { Suspense } from 'react';
import { Await, useOutletContext, useSearchParams } from 'react-router';
import { DetailPageLayout } from '~/components/detail-page-layout';
import { DetailPriceCard } from '~/components/detail-price-card';
import { ListingRatingSummary } from '~/components/listing-rating-summary';
import { RelatedListingsSkeleton, ReviewsSectionSkeleton } from '~/components/loading-skeletons';
import { PublicReviewsSection } from '~/components/public-reviews-section';
import { SectionCard } from '~/components/section-card';
import { NsI18n, useTranslation } from '@booking/i18n';
import { formatListingLocation, formatVnd } from '~/lib/ui';
import type { loadListingRoute } from '~/features/listing/server/listing-route.server';
import type { ServerDataFrom } from '~/lib/react-router-data';
import type { StorefrontContext } from '~/root';
import { ExpandableDescription } from '~/components/expandable-description';
import { HeaderActions } from '~/components/header-actions';
import { ProviderCard } from '~/components/provider-card';
import { ListingGallery } from '~/components/listing-gallery';
import { DeferredSearchBar } from '~/features/search/components/deferred-search-bar';
import { PackageAlbums } from './package-albums';
import { PackageBookingDialog } from './package-booking-dialog';
import { listingPackages, minimumPackagePrice } from '~/features/packages/lib/package-data';
import { PackageTable } from './package-table';
import { RelatedListings } from '~/components/related-listings';
import { usePackageBookingController } from '~/features/packages/hooks/use-package-booking-controller';
import { MobileDetailHeader } from '~/components/mobile-detail-header';
import { MobileDetailSummary } from '~/components/mobile-detail-summary';
import { catalogReturnHref } from '~/features/search/lib/catalog-return-href';

export function PackageListingPage({
  loaderData,
}: {
  loaderData: ServerDataFrom<typeof loadListingRoute>;
}) {
  const { listing, locations, auxiliaryData, bookingToday } = loaderData;
  const { listingTypes, locale } = useOutletContext<StorefrontContext>();
  const { t } = useTranslation([NsI18n.Listing, NsI18n.Common]);
  const [searchParams] = useSearchParams();
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
    <>
      <DetailPageLayout
        searchBar={
          <DeferredSearchBar
            listingTypes={listingTypes}
            currentType={listing.listingTypeSlug}
            locations={locations}
            today={bookingToday}
          />
        }
        mobileHeader={
          <MobileDetailHeader
            backHref={catalogReturnHref(locale, listing.listingTypeSlug, searchParams)}
            title={listing.title}
            favorite={{ kind: 'listing', id: listing.id }}
          />
        }
        header={
          <header className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h1 className="text-2xl leading-tight font-semibold">{listing.title}</h1>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
                {location ? (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="size-4" aria-hidden="true" />
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
        }
        gallery={
          <ListingGallery
            key={selectedPackage?.id ?? 'packages'}
            photos={galleryPhotos}
            title={selectedPackage ? `${listing.title} — ${selectedPackage.name}` : listing.title}
          />
        }
        mobileSummary={
          <MobileDetailSummary
            title={listing.title}
            location={location}
            ratingAvg={listing.ratingAvg}
            reviewCount={listing.reviewCount}
            completedBookings={listing.trust.completedBookings}
          />
        }
        main={
          <>
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
          </>
        }
        booking={
          <div className="max-md:hidden">
            <DetailPriceCard>
              {minimumPrice ? (
                <p className="text-sm text-muted-foreground">
                  {t('fromPriceShort')}{' '}
                  <strong className="text-xl text-primary">{formatVnd(minimumPrice)}</strong>
                </p>
              ) : (
                <p className="font-semibold">{t('pickScheduleForPrice')}</p>
              )}
              <p className="mt-1 text-xs text-muted-foreground">{t('perSession')}</p>
              <Button asChild size="control" className="mt-5 w-full">
                <a href="#packages">{t('packages.viewPackages')}</a>
              </Button>
            </DetailPriceCard>
          </div>
        }
        mobileBooking={false}
        provider={<ProviderCard trust={listing.trust} />}
        footerSections={
          <>
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
                {({ relatedListings, ...reviewData }) => (
                  <>
                    <PublicReviewsSection {...reviewData} locale={locale} />
                    <RelatedListings
                      listings={relatedListings}
                      title={t('packages.related')}
                      titleId="related-listings-title"
                      titleClassName="text-lg"
                    />
                  </>
                )}
              </Await>
            </Suspense>
          </>
        }
      />

      <PackageBookingDialog
        open={bookingOpen}
        onOpenChange={changeBookingOpen}
        returnFocusRef={bookingTriggerRef}
        selectedPackage={selectedPackage}
        listing={listing}
        today={bookingToday}
      />
    </>
  );
}
