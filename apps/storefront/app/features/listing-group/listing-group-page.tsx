import { Button } from '@booking/ui/components/ui/button';
import { MapPin } from 'lucide-react';
import { useOutletContext } from 'react-router';
import { ListingRatingSummary } from '~/components/listing-rating-summary';
import { PublicReviewsSection } from '~/components/public-reviews-section';
import { SectionCard } from '~/components/section-card';
import { NsI18n, useTranslation } from '~/lib/i18n';
import { formatListingLocation, googleMapsHref } from '~/lib/ui';
import { useLocale } from '~/lib/use-locale';
import { clockHoursBetween } from '~/lib/time';
import type { StorefrontContext } from '~/root';
import { SearchForm } from '~/features/search/search-form';
import { AmenitiesSection } from './components/amenities-section';
import { ExpandableDescription } from './components/expandable-description';
import { HeaderActions } from './components/header-actions';
import { ProviderCard } from './components/provider-card';
import { RelatedStudios } from './components/related-studios';
import { RoomOptionsSection } from './components/room-options-section';
import { StudioGallery } from './components/studio-gallery';
import type { ListingGroupData } from './listing-group-types';
import { minimumRoomPrice } from './room-attributes';

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
    <div className="font-studio overflow-x-clip bg-muted/30 pb-20 text-foreground">
      <SearchForm
        key={`${state.mode}:${state.date}:${state.startTime}:${state.endTime}:${state.from}:${state.to}`}
        listingTypes={listingTypes}
        currentType={group.listingTypeSlug}
        initialState={state}
        locations={locations}
        variant="bar"
      />

      <div className="mx-auto flex max-w-292.5 flex-col gap-4 px-4 py-4 xl:px-0">
        <SectionCard>
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
          <StudioGallery photos={group.photos} title={group.title} />
        </SectionCard>

        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,870px)_284px]">
          <div className="flex min-w-0 flex-col gap-4">
            <SectionCard aria-labelledby="introduction-title">
              <h2 id="introduction-title" className="text-base font-semibold">
                {t('group.introduction')}
              </h2>
              <ExpandableDescription description={group.description} />
            </SectionCard>

            <AmenitiesSection amenities={group.amenities} />
          </div>

          <aside className="flex flex-col gap-4 lg:sticky lg:top-24">
            <div className="rounded-lg bg-card p-5 text-right text-card-foreground shadow-sm">
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
            </div>
            <ProviderCard trust={trust} />
          </aside>
        </div>

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
          summary={loaderData.reviewSummary}
          locale={locale}
          selectedRating={loaderData.reviewRating}
          visibleLimit={loaderData.reviewLimit}
        />

        <RelatedStudios listings={relatedListings} />
      </div>
    </div>
  );
}
