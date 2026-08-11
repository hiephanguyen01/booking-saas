import { NsI18n, useTranslation } from '@booking/i18n';
import { Button } from '@booking/ui/components/ui/button';
import { cn } from '@booking/ui/lib/utils';
import { LocateFixed, MapPin } from 'lucide-react';
import { HomeListingCardsSkeleton } from '~/components/loading-skeletons';
import { SectionHeading } from '~/components/section-heading';
import { PANEL_SURFACE } from '~/constants/surfaces';
import { discoveryListingFromNearbyItem } from '~/features/catalog/lib/listing-card-presentation';
import { useNearbyListingsController } from '~/features/home/hooks/use-nearby-listings-controller';
import { HomeDiscoverySectionHeading, HomeListingRail } from './home-listing-rail';

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
            'flex-col items-start gap-4 bg-card p-(--sf-surface-pad) sm:flex-row sm:items-center md:px-5 md:py-4',
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
      <section className="flex flex-col gap-4 sm:gap-6">
        <HomeDiscoverySectionHeading title={title} />
        <HomeListingCardsSkeleton label={t('loading')} count={4} layout="carousel" />
      </section>
    );
  }

  if (requestFailed || items.length === 0) {
    return (
      <section className="flex flex-col gap-4 sm:gap-6">
        <HomeDiscoverySectionHeading title={title} />
        <p
          className={cn(
            PANEL_SURFACE,
            'bg-card p-(--sf-surface-pad) text-center text-sm text-muted-foreground md:px-6 md:py-12',
          )}
        >
          {t(requestFailed ? 'home.nearbyUnavailable' : 'home.nearbyEmpty')}
        </p>
      </section>
    );
  }

  return (
    <HomeListingRail
      title={title}
      items={items.map(discoveryListingFromNearbyItem)}
      previousLabel={t('home.railPrevious')}
      nextLabel={t('home.railNext')}
    />
  );
}
