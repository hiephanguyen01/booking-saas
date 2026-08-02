import { Button } from '@booking/ui/components/ui/button';
import { MapPin } from 'lucide-react';
import { useOutletContext } from 'react-router';
import { DetailPageLayout } from '~/components/detail-page-layout';
import { DetailPriceCard } from '~/components/detail-price-card';
import { ListingRatingSummary } from '~/components/listing-rating-summary';
import { PublicReviewsSection } from '~/components/public-reviews-section';
import { SectionCard } from '~/components/section-card';
import { NsI18n, useTranslation } from '@booking/i18n';
import { formatListingLocation, googleMapsHref } from '~/lib/ui';
import { useLocale } from '~/hooks/use-locale';
import { clockHoursBetween } from '~/lib/time';
import type { StorefrontContext } from '~/root';
import { SearchForm } from '~/features/search/components/search-form';
import { AmenitiesSection } from './amenities-section';
import { ExpandableDescription } from '~/components/expandable-description';
import { HeaderActions } from '~/components/header-actions';
import { ProviderCard } from '~/components/provider-card';
import { RelatedListings } from '~/components/related-listings';
import { RoomOptionsSection } from './room-options-section';
import { ListingGallery } from '~/components/listing-gallery';
import type { ListingGroupData } from '~/features/listing-group/lib/listing-group-types';
import { minimumRoomPrice } from '~/features/listing-group/lib/room-attributes';

/**
 * A listing group ("studio") and the rooms bookable inside it.
 *
 * Rating and review content come from the public review API and persisted
 * aggregates. Promotions remain absent until a truthful public contract exists.
 */
export function ListingGroupPage({ loaderData }: { loaderData: ListingGroupData }) {
  const { group, state, roomOptions, locations, relatedListings } = loaderData;
  const { listingTypes } = useOutletContext<StorefrontContext>();
  const { t } = useTranslation(NsI18n.Listing);
  const locale = useLocale();
  const location = formatListingLocation(group, 'full');
  const trust = group.trust;
  const minimumPrice = minimumRoomPrice(
    roomOptions.filter((option) => option.browsing || option.available),
  );
  const selectedHours = state.hasTimeSelection
    ? clockHoursBetween(state.startTime, state.endTime)
    : null;
  const mapsHref = googleMapsHref(location);

  return (
    <DetailPageLayout
      searchBar={
        <SearchForm
          key={`${state.mode}:${state.date}:${state.startTime}:${state.endTime}:${state.from}:${state.to}`}
          listingTypes={listingTypes}
          currentType={group.listingTypeSlug}
          initialState={state}
          locations={locations}
          variant="bar"
          typeChangeBehavior="navigate-to-catalog"
        />
      }
      header={
        <header className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold leading-tight md:text-2xl">{group.title}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground sm:text-sm">
              <ListingRatingSummary ratingAvg={group.ratingAvg} reviewCount={group.reviewCount} />
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
          <HeaderActions title={group.title} favorite={{ kind: 'group', id: group.id }} />
        </header>
      }
      gallery={<ListingGallery photos={group.photos} title={group.title} />}
      main={
        <>
          <SectionCard aria-labelledby="introduction-title">
            <h2 id="introduction-title" className="text-base font-semibold">
              {t('group.introduction')}
            </h2>
            <ExpandableDescription description={group.description} />
          </SectionCard>

          <AmenitiesSection amenities={group.amenities} />
        </>
      }
      aside={
        <>
          <DetailPriceCard>
            <p className="text-sm text-muted-foreground">
              {t('fromPriceShort')}{' '}
              <strong className="text-xl text-primary">
                {minimumPrice ?? t('group.priceOnRequest')}
              </strong>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {state.mode === 'hourly'
                ? selectedHours
                  ? t('forHours', { count: selectedHours })
                  : t('perHour')
                : t('group.priceForRange', { from: state.from, to: state.to })}
            </p>
            <Button asChild className="mt-5 w-full">
              <a href="#room-options">{t('group.viewRooms')}</a>
            </Button>
          </DetailPriceCard>
          <ProviderCard trust={trust} />
        </>
      }
      footerSections={
        <>
          <RoomOptionsSection
            key={`${state.mode}:${state.date}:${state.startTime}:${state.endTime}:${state.from}:${state.to}`}
            roomOptions={roomOptions}
            attributeSchema={group.attributeSchema}
            groupSlug={group.slug}
            mode={state.mode}
            date={state.date}
            hideUnavailableByDefault={state.hasTimeSelection || state.hasDailyRange}
          />

          <PublicReviewsSection
            reviews={loaderData.reviews}
            reviewSummary={loaderData.reviewSummary}
            locale={locale}
            reviewRating={loaderData.reviewRating}
            reviewLimit={loaderData.reviewLimit}
          />

          <RelatedListings
            listings={relatedListings}
            title={t('group.related')}
            titleId="related-title"
          />
        </>
      }
    />
  );
}
