import type { PublicListingDetailResponse } from '@booking/contracts';
import { MapPin, Users } from 'lucide-react';
import { Suspense } from 'react';
import { Await, Link, useOutletContext } from 'react-router';
import { DetailPageLayout } from '~/components/detail-page-layout';
import { ListingRatingSummary } from '~/components/listing-rating-summary';
import { ReviewsSectionSkeleton } from '~/components/loading-skeletons';
import { PublicReviewsSection } from '~/components/public-reviews-section';
import { SectionCard } from '~/components/section-card';
import { NsI18n, useTranslation } from '~/lib/i18n';
import { storefrontPaths } from '~/constants/paths';
import { formatListingLocation, googleMapsHref } from '~/lib/ui';
import { useLocale } from '~/hooks/use-locale';
import type { loadListingRoute } from '~/features/listing/server/listing-route.server';
import type { ServerDataFrom } from '~/lib/react-router-data';
import type { StorefrontContext } from '~/root';
import { BookingPanel } from '~/features/booking-widget/components/booking-panel';
import { ExpandableDescription } from '~/components/expandable-description';
import { HeaderActions } from '~/components/header-actions';
import { ProviderCard } from '~/components/provider-card';
import { StudioGallery } from '~/components/studio-gallery';
import { AttributeSpecCards } from '~/components/attribute-spec-cards';
import { roomCapacity, specCards } from '~/features/listing-group/lib/room-attributes';
import { DeferredSearchBar } from '~/features/search/components/deferred-search-bar';
import { StudioBookingCard } from './studio-booking-card';

export interface ListingPageProps {
  loaderData: ServerDataFrom<typeof loadListingRoute>;
  params: { locale: string; listingSlug: string };
}

export function ListingPage({ loaderData, params }: ListingPageProps) {
  const {
    listing,
    mode,
    availability,
    quote,
    locations,
    selectionStart,
    selectionEnd,
    bookingToday,
  } = loaderData;
  const { t } = useTranslation([NsI18n.Listing, NsI18n.Common]);
  const locale = useLocale();
  const { listingTypes } = useOutletContext<StorefrontContext>();

  if (!listing) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-24 text-center text-muted-foreground">
        {t('notFound', { slug: params.listingSlug })}
      </div>
    );
  }

  const location = formatListingLocation(listing, 'full');
  const supportsOnlineBooking = mode !== null;
  const usesStudioBookingDialog =
    supportsOnlineBooking &&
    listing.listingTypeSlug === 'studio' &&
    listing.bookingModes.some((item) => item === 'hourly' || item === 'daily');
  const preferredStudioMode = mode === 'daily' ? 'daily' : 'hourly';

  return (
    <DetailPageLayout
      searchBar={
        <DeferredSearchBar
          listingTypes={listingTypes}
          currentType={listing.listingTypeSlug}
          locations={locations}
          today={bookingToday}
        />
      }
      header={
        <ListingHeader listing={listing} location={location} mapsHref={googleMapsHref(location)} />
      }
      gallery={<StudioGallery photos={listing.photos} title={listing.title} />}
      main={
        <>
          <SectionCard aria-labelledby="introduction-title">
            <h2 id="introduction-title" className="text-base font-semibold">
              {t('group.introduction')}
            </h2>
            <ExpandableDescription description={listing.description} />
          </SectionCard>

          <ListingDetails
            attributes={listing.attributes}
            attributeSchema={listing.attributeSchema}
          />
          <Suspense fallback={<ReviewsSectionSkeleton label={t('common:loading')} />}>
            <Await resolve={loaderData.auxiliaryData}>
              {({ reviews, reviewSummary, reviewRating, reviewLimit }) => (
                <PublicReviewsSection
                  reviews={reviews}
                  summary={reviewSummary}
                  locale={locale}
                  selectedRating={reviewRating}
                  visibleLimit={reviewLimit}
                />
              )}
            </Await>
          </Suspense>
        </>
      }
      aside={
        usesStudioBookingDialog ? (
          <>
            <StudioBookingCard
              listing={listing}
              preferredMode={preferredStudioMode}
              today={bookingToday}
            />
            <ProviderCard trust={listing.trust} />
          </>
        ) : (
          <>
            <ProviderCard trust={listing.trust} />
            {supportsOnlineBooking ? (
              <BookingPanel
                listing={listing}
                mode={mode}
                availability={availability}
                quote={quote}
                initialStart={selectionStart}
                initialEnd={selectionEnd}
                initialToday={bookingToday}
              />
            ) : null}
          </>
        )
      }
    />
  );
}

function ListingHeader({
  listing,
  location,
  mapsHref,
}: {
  listing: PublicListingDetailResponse;
  location: string | null;
  mapsHref: string | null;
}) {
  const { t } = useTranslation(NsI18n.Listing);
  const locale = useLocale();
  return (
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
          <ListingRatingSummary ratingAvg={listing.ratingAvg} reviewCount={listing.reviewCount} />
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
  );
}

function ListingDetails({
  attributes,
  attributeSchema,
}: {
  attributes: Record<string, unknown>;
  attributeSchema: PublicListingDetailResponse['attributeSchema'];
}) {
  const { t } = useTranslation(NsI18n.Listing);
  const cards = specCards(attributes, attributeSchema);
  const capacity = roomCapacity(attributes);

  if (!cards.length && !capacity) return null;

  return (
    <SectionCard aria-labelledby="listing-details-title">
      <h2 id="listing-details-title" className="text-base font-semibold">
        {t('info')}
      </h2>
      <div className="mt-5 flex flex-col gap-3">
        {capacity ? (
          <div className="flex items-start gap-2.5 text-sm">
            <Users className="mt-0.5 size-4 shrink-0 text-foreground" aria-hidden="true" />
            <span className="text-muted-foreground">
              {t('group.maxGuests', { count: capacity })}
            </span>
          </div>
        ) : null}
        <AttributeSpecCards cards={cards} />
      </div>
    </SectionCard>
  );
}
