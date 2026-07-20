import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
} from '@booking/ui/components/ui/carousel';
import type { PublicListingResponse } from '@booking/contracts';
import { FavoriteListingCard } from '../../features/favorites/components/favorite-cards';
import { NsI18n, useTranslation } from '../../lib/i18n';

/** The home page's lead rail of listings. */
export function TopListingsSection({ listings }: { listings: PublicListingResponse[] }) {
  const { t } = useTranslation(NsI18n.Common);
  if (listings.length === 0) return null;

  return (
    <section className="flex flex-col gap-6">
      <div className="bg-card px-6 py-5 shadow-sm">
        <h2 className="text-lg font-semibold text-foreground">{t('home.topListings')}</h2>
      </div>
      <Carousel opts={{ align: 'start', slidesToScroll: 1 }}>
        <CarouselContent>
          {listings.map((listing) => (
            <CarouselItem
              key={listing.id}
              className="basis-[88%] sm:basis-1/2 md:basis-1/3 lg:basis-1/4"
            >
              <FavoriteListingCard listing={listing} />
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselNext className="right-[-8px] hidden size-10 bg-card shadow-md md:flex" />
      </Carousel>
    </section>
  );
}
