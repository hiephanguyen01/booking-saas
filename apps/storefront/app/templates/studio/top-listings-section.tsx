import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
} from '@booking/ui/components/ui/carousel';
import { ListingCard } from '../../features/catalog/components/listing-card';
import { NsI18n, useTranslation } from '../../lib/i18n';
import type { HomeListingViewModel } from './home-listing-presentation';

/**
 * "Top 10 Studio đặt nhiều nhất" row. Booking totals are deterministic home
 * presentation fixtures until the public listing contract exposes popularity.
 */
export function TopListingsSection({ listings }: { listings: HomeListingViewModel[] }) {
  const { t } = useTranslation(NsI18n.Common);
  if (listings.length === 0) return null;

  return (
    <section className="flex flex-col gap-6">
      <div className="bg-card px-6 py-5 shadow-[0_4px_5px_rgba(0,0,0,0.04)]">
        <h2 className="text-lg font-semibold text-foreground">{t('home.topListings')}</h2>
      </div>
      <Carousel opts={{ align: 'start', slidesToScroll: 1 }}>
        <CarouselContent>
          {listings.map(({ listing, presentation }) => (
            <CarouselItem
              key={listing.id}
              className="basis-[88%] sm:basis-1/2 md:basis-1/3 lg:basis-1/4"
            >
              <ListingCard listing={listing} presentation={presentation} />
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselNext className="right-[-8px] hidden size-10 bg-card shadow-md md:flex" />
      </Carousel>
    </section>
  );
}
