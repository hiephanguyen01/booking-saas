import type { PublicListingResponse } from '@booking/contracts';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
} from '@booking/ui/components/ui/carousel';
import { useT } from '../../lib/i18n';
import { ListingCard } from '../../features/catalog/components/listing-card';

/**
 * "Top 10 Studio đặt nhiều nhất" row. NOTE: this is not a real popularity
 * ranking — `PublicListingResponse` has no booking-count field. It's simply
 * the first N listings in catalog order. Revisit if/when the backend adds a
 * popularity signal.
 */
export function TopListingsSection({ listings }: { listings: PublicListingResponse[] }) {
  const { t } = useT();
  if (listings.length === 0) return null;

  return (
    <section className="rounded-2xl border border-border bg-card p-6">
      <h2 className="mb-6 text-lg font-semibold text-foreground">{t('home.topListings')}</h2>
      <Carousel opts={{ align: 'start' }} className="px-1">
        <CarouselContent>
          {listings.map((listing) => (
            <CarouselItem key={listing.id} className="basis-1/2 sm:basis-1/3 lg:basis-1/4">
              <ListingCard listing={listing} />
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselNext className="hidden md:flex" />
      </Carousel>
    </section>
  );
}
