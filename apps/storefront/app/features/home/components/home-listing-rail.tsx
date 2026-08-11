import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@booking/ui/components/ui/carousel';
import type { ReactNode } from 'react';
import { SectionHeading } from '~/components/section-heading';
import type { DiscoveryListingCardData } from '~/features/catalog/lib/listing-card.types';
import { FavoriteDiscoveryListingCard } from '~/features/favorites/components/favorite-cards';

export function HomeDiscoverySectionHeading({
  title,
  action,
}: {
  title: string;
  action?: ReactNode;
}) {
  return (
    <SectionHeading
      title={title}
      action={action}
      className="bg-card"
    />
  );
}

/** Shared Figma-aligned listing rail for the home discovery sections. */
export function HomeListingRail({
  title,
  items,
  action,
  previousLabel,
  nextLabel,
}: {
  title: string;
  items: DiscoveryListingCardData[];
  action?: ReactNode;
  previousLabel: string;
  nextLabel: string;
}) {
  return (
    <section>
      <Carousel
        aria-label={title}
        className="flex flex-col gap-4 sm:gap-6 [&_[data-slot=carousel-content]]:-mx-4 [&_[data-slot=carousel-content]]:overflow-x-clip [&_[data-slot=carousel-content]]:overflow-y-visible [&_[data-slot=carousel-content]]:px-4 sm:[&_[data-slot=carousel-content]]:-mx-6 sm:[&_[data-slot=carousel-content]]:px-6 xl:[&_[data-slot=carousel-content]]:mx-0 xl:[&_[data-slot=carousel-content]]:px-0"
        opts={{ align: 'start', slidesToScroll: 1 }}
      >
        <HomeDiscoverySectionHeading title={title} action={action} />
        <div className="relative">
          <CarouselContent className="ml-0 gap-3 sm:gap-4 xl:gap-6">
            {items.map((item) => (
              <CarouselItem
                key={item.listing.id}
                className="basis-[13rem] pl-0 sm:basis-[calc((100%_-_2rem)/3)] lg:basis-[calc((100%_-_3rem)/4)] xl:basis-[277.5px]"
              >
                <FavoriteDiscoveryListingCard item={item} />
              </CarouselItem>
            ))}
          </CarouselContent>
          <CarouselPrevious
            aria-label={previousLabel}
            className="absolute top-1/2 left-2 z-20 hidden size-10 -translate-y-1/2 bg-card shadow-md disabled:invisible md:flex xl:-left-5"
          />
          <CarouselNext
            aria-label={nextLabel}
            className="absolute top-1/2 right-2 z-20 hidden size-10 -translate-y-1/2 bg-card shadow-md disabled:invisible md:flex xl:-right-5"
          />
        </div>
      </Carousel>
    </section>
  );
}
