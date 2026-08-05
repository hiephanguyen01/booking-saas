import type { PublicListingResponse } from '@booking/contracts';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@booking/ui/components/ui/carousel';
import { Button } from '@booking/ui/components/ui/button';
import { LocateFixed, MapPin } from 'lucide-react';
import { NsI18n, useTranslation } from '@booking/i18n';
import { cn } from '@booking/ui/lib/utils';
import { HomeListingCardsSkeleton } from '~/components/loading-skeletons';
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
    return (
      <section className="flex flex-col gap-6">
        <NearbyHeader title={title} />
        <div
          className={cn(
            PANEL_SURFACE,
            'flex flex-col items-start gap-4 bg-card p-6 sm:flex-row sm:items-center sm:justify-between',
          )}
        >
          <div className="flex gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <MapPin aria-hidden className="size-5" />
            </span>
            <div>
              <p className="font-medium text-foreground">{t('home.nearbyPermissionTitle')}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {t(locationState === 'denied' ? 'home.nearbyDenied' : 'home.nearbyPermissionBody')}
              </p>
            </div>
          </div>
          <Button type="button" size="control" onClick={requestLocation}>
            <LocateFixed aria-hidden />
            {t(locationState === 'denied' ? 'home.nearbyRetry' : 'home.nearbyUseLocation')}
          </Button>
        </div>
      </section>
    );
  }

  if (pending || loading) {
    return (
      <section className="flex flex-col gap-6">
        <NearbyHeader title={title} />
        <HomeListingCardsSkeleton label={t('loading')} count={4} layout="carousel" />
      </section>
    );
  }

  if (requestFailed || items.length === 0) {
    return (
      <section className="flex flex-col gap-6">
        <NearbyHeader title={title} />
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
        className="flex flex-col gap-6 [&_[data-slot=carousel-content]]:-mx-4 [&_[data-slot=carousel-content]]:px-4"
        opts={{ align: 'start', slidesToScroll: 1 }}
      >
        <NearbyHeader
          title={title}
          controls={
            <div className="hidden items-center gap-2 md:flex">
              <CarouselPrevious
                aria-label={t('home.railPrevious')}
                className="static size-10 translate-y-0 bg-card shadow-sm"
              />
              <CarouselNext
                aria-label={t('home.railNext')}
                className="static size-10 translate-y-0 bg-card shadow-sm"
              />
            </div>
          }
        />
        <CarouselContent className="-ml-5 py-4">
          {items.map((item) => {
            const listing: PublicListingResponse = {
              ...item,
              attributes: {},
              itemLabel: null,
            };
            return (
              <CarouselItem
                key={item.id}
                className="basis-[88%] pl-5 sm:basis-1/2 md:basis-1/3 lg:basis-1/4"
              >
                <FavoriteListingCard
                  listing={listing}
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

function NearbyHeader({ title, controls }: { title: string; controls?: React.ReactNode }) {
  return (
    <div
      className={cn(
        PANEL_SURFACE,
        'flex min-h-16 items-center justify-between gap-4 bg-card px-6 py-5',
      )}
    >
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      {controls}
    </div>
  );
}
