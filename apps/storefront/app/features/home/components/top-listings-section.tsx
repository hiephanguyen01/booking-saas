import type { PublicListingResponse } from '@booking/contracts';
import { NsI18n, useTranslation } from '@booking/i18n';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@booking/ui/components/ui/carousel';
import { cn } from '@booking/ui/lib/utils';
import { HomeListingCardsSkeleton } from '~/components/loading-skeletons';
import { PANEL_SURFACE } from '~/constants/surfaces';
import { FavoriteListingCard } from '~/features/favorites/components/favorite-cards';

/** The home page's lead rail of listings. */
export function TopListingsSection({
  listings,
  listingTypeName,
  pending,
}: {
  listings: PublicListingResponse[];
  listingTypeName: string;
  pending: boolean;
}) {
  const { t } = useTranslation(NsI18n.Common);
  if (!pending && listings.length === 0) return null;

  const title = t('home.topListings', { type: listingTypeName });

  if (pending) {
    return (
      <section className="flex flex-col gap-6">
        <RailHeader title={title} />
        <HomeListingCardsSkeleton label={t('loading')} count={4} layout="carousel" />
      </section>
    );
  }

  return (
    <section>
      {/*
        The controls live in the header, not floating over the rail. Pinned to
        the viewport edge they sat on top of the last card — and the page
        container loses its side gutter at `xl`, so there is no outside margin
        to move them into either. The header has the room, and putting them
        there makes a "previous" control possible: the rail used to offer only
        "next", leaving no way back other than dragging.
      */}
      <Carousel
        aria-label={title}
        className="flex flex-col gap-6 [&_[data-slot=carousel-content]]:-mx-4 [&_[data-slot=carousel-content]]:px-4"
        opts={{ align: 'start', slidesToScroll: 1 }}
      >
        <RailHeader
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
        <CarouselContent className="-ml-3 py-4 sm:-ml-5">
          {listings.map((listing) => (
            <CarouselItem
              key={listing.id}
              className="basis-1/2 pl-3 sm:pl-5 md:basis-1/3 lg:basis-1/4"
            >
              {/* A rail slide is ~165px wide; the row layout would leave a 55px
                  photo beside it, so the rails keep the stacked card. */}
              <FavoriteListingCard listing={listing} layout="stacked" />
            </CarouselItem>
          ))}
        </CarouselContent>
      </Carousel>
    </section>
  );
}

function RailHeader({ title, controls }: { title: string; controls?: React.ReactNode }) {
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
