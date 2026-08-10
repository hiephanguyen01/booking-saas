import type { PublicListingResponse } from '@booking/contracts';
import { NsI18n, useTranslation } from '@booking/i18n';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@booking/ui/components/ui/carousel';
import { Link } from 'react-router';
import { HomeListingCardsSkeleton } from '~/components/loading-skeletons';
import { SectionHeading } from '~/components/section-heading';
import { storefrontPaths } from '~/constants/paths';
import { FavoriteListingCard } from '~/features/favorites/components/favorite-cards';
import { useLocale } from '~/hooks/use-locale';

/** The home page's lead rail of listings. */
export function TopListingsSection({
  listings,
  listingTypeName,
  listingTypeSlug,
  pending,
}: {
  listings: PublicListingResponse[];
  listingTypeName: string;
  listingTypeSlug: string;
  pending: boolean;
}) {
  const { t } = useTranslation([NsI18n.Common, NsI18n.Navigation]);
  const locale = useLocale();
  if (!pending && listings.length === 0) return null;

  const title = t('home.topListings', { type: listingTypeName });

  if (pending) {
    return (
      <section className="flex flex-col gap-(--sf-section-gap) md:gap-4">
        <SectionHeading title={title} />
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
        className="flex flex-col gap-(--sf-section-gap) md:gap-4 [&_[data-slot=carousel-content]]:-mx-4 [&_[data-slot=carousel-content]]:px-4"
        opts={{ align: 'start', slidesToScroll: 1 }}
      >
        <SectionHeading
          title={title}
          action={
            <>
              {/* The rail shows four of the ten; on a phone, where the arrows are
                  hidden, this link is the only way to the rest of them. */}
              <Link
                to={storefrontPaths.catalog(locale, listingTypeSlug)}
                prefetch="intent"
                className="text-sm font-semibold text-primary hover:underline"
              >
                {t('navigation:all')}
              </Link>
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
            </>
          }
        />
        <CarouselContent className="-ml-3 pb-4 sm:-ml-4">
          {listings.map((listing) => (
            <CarouselItem
              key={listing.id}
              className="basis-[13rem] pl-3 sm:basis-1/3 sm:pl-4 lg:basis-1/4"
            >
              {/* A rail slide is ~208px wide; the row layout would leave a 55px
                  photo beside it, so the rails keep the stacked card. */}
              <FavoriteListingCard listing={listing} layout="stacked" />
            </CarouselItem>
          ))}
        </CarouselContent>
      </Carousel>
    </section>
  );
}
