import type { PublicListingResponse } from '@booking/contracts';
import { NsI18n, useTranslation } from '@booking/i18n';
import { Button } from '@booking/ui/components/ui/button';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@booking/ui/components/ui/carousel';
import { cn } from '@booking/ui/lib/utils';
import { LocateFixed, MapPin } from 'lucide-react';
import { HomeListingCardsSkeleton } from '~/components/loading-skeletons';
import { SectionHeading } from '~/components/section-heading';
import { PANEL_SURFACE } from '~/constants/surfaces';
import { FavoriteListingCard } from '~/features/favorites/components/favorite-cards';
import { useNearbyListingsController } from '~/features/home/hooks/use-nearby-listings-controller';

export function NearbySection({
  listingTypeSlug,
  listingTypeName,
  pending,
}: {
  listingTypeSlug: string;
  listingTypeName: string;
  pending: boolean;
}) {
  const { t } = useTranslation(NsI18n.Common);
  const { items, loading, locationState, requestFailed, requestLocation } =
    useNearbyListingsController(listingTypeSlug);
  const title = t('home.nearby', { type: listingTypeName });

  if (locationState === 'unsupported') return null;

  if (locationState === 'prompt' || locationState === 'denied' || locationState === 'error') {
    const description = t(
      locationState === 'denied'
        ? 'home.nearbyDenied'
        : locationState === 'error'
          ? 'home.nearbyLocationError'
          : 'home.nearbyPermissionBody',
    );
    return (
      <section>
        {/* The permission ask is a thing to act on rather than a heading, so this
            one keeps the panel the plain section titles gave up. */}
        <SectionHeading
          // Stacked on a phone: side by side, the button's `shrink-0` squeezed the
          // explanation into a four-word column.
          className={cn(
            PANEL_SURFACE,
            'flex-col items-start gap-4 bg-card px-4 py-4 sm:flex-row sm:items-center sm:px-5',
          )}
          title={title}
          description={description}
          icon={<MapPin aria-hidden className="mt-0.5 size-5 shrink-0 text-primary" />}
          action={
            <Button
              type="button"
              variant="outline"
              size="control"
              className="shrink-0 border-primary/30 text-primary hover:bg-primary/5 hover:text-primary"
              onClick={requestLocation}
            >
              <LocateFixed aria-hidden />
              {t(locationState === 'prompt' ? 'home.nearbyUseLocation' : 'home.nearbyRetry')}
            </Button>
          }
        />
      </section>
    );
  }

  if (pending || loading) {
    return (
      <section className="flex flex-col gap-4">
        <SectionHeading title={title} />
        <HomeListingCardsSkeleton label={t('loading')} count={4} layout="carousel" />
      </section>
    );
  }

  if (requestFailed || items.length === 0) {
    return (
      <section className="flex flex-col gap-4">
        <SectionHeading title={title} />
        <p
          className={cn(
            PANEL_SURFACE,
            'bg-card px-6 py-12 text-center text-sm text-muted-foreground',
          )}
        >
          {t(requestFailed ? 'home.nearbyUnavailable' : 'home.nearbyEmpty')}
        </p>
      </section>
    );
  }

  return (
    <section>
      <Carousel
        aria-label={title}
        className="flex flex-col gap-4 [&_[data-slot=carousel-content]]:-mx-4 [&_[data-slot=carousel-content]]:px-4"
        opts={{ align: 'start', slidesToScroll: 1 }}
      >
        <SectionHeading
          title={title}
          action={
            <div className="hidden items-center gap-2 md:flex">
              <CarouselPrevious
                aria-label={t('home.railPrevious')}
                className="static size-9 translate-y-0 bg-card shadow-sm"
              />
              <CarouselNext
                aria-label={t('home.railNext')}
                className="static size-9 translate-y-0 bg-card shadow-sm"
              />
            </div>
          }
        />
        <CarouselContent className="-ml-3 pb-4 sm:-ml-4">
          {items.map((item) => {
            const listing: PublicListingResponse = {
              ...item,
              attributes: {},
              itemLabel: null,
            };
            return (
              <CarouselItem
                key={item.id}
                className="basis-[13rem] pl-3 sm:basis-1/3 sm:pl-4 lg:basis-1/4"
              >
                {/* Rail slide — see `ListingCard`'s note on why rails stay stacked. */}
                <FavoriteListingCard
                  listing={listing}
                  layout="stacked"
                  presentation={{
                    originalPrice: null,
                    discountPercent: null,
                    priceUnit: null,
                    distanceMeters: item.distanceMeters,
                  }}
                />
              </CarouselItem>
            );
          })}
        </CarouselContent>
      </Carousel>
    </section>
  );
}
