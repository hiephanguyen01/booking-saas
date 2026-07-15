import { Button } from '@booking/ui/components/ui/button';
import { useState } from 'react';
import { NsI18n, useTranslation } from '../../lib/i18n';
import { ListingCard } from '../../features/catalog/components/listing-card';
import { LocationTabs } from './location-tabs';
import {
  filterHomeListingsByLocation,
  type HomeListingViewModel,
  type HomeLocationKey,
} from './home-listing-presentation';

const PAGE_SIZE = 8;

/**
 * "Đề xuất dành cho bạn" — location-filtered catalog with a client-side
 * "Xem thêm" reveal. No new fetch/route: it
 * pages through the array already loaded by the home route's SSR loader.
 */
export function RecommendedSection({ listings }: { listings: HomeListingViewModel[] }) {
  const { t } = useTranslation(NsI18n.Common);
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [location, setLocation] = useState<HomeLocationKey>('hcm');
  if (listings.length === 0) return null;

  const filtered = filterHomeListingsByLocation(listings, location);
  const shown = filtered.slice(0, visible);
  const hasMore = visible < filtered.length;

  function changeLocation(next: HomeLocationKey): void {
    setLocation(next);
    setVisible(PAGE_SIZE);
  }

  return (
    <section className="flex flex-col gap-6">
      <div className="min-h-29 bg-card px-4 pt-6 pb-1 font-studio shadow-[0_4px_5px_rgba(0,0,0,0.04)] sm:px-6">
        <h2 className="text-lg leading-7 font-semibold text-[#101828]">
          {t('home.recommended')}
        </h2>
        <LocationTabs value={location} onValueChange={changeLocation} />
      </div>
      {shown.length > 0 ? (
        <div className="grid grid-cols-1 gap-x-5 gap-y-5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {shown.map(({ listing, presentation }) => (
            <ListingCard key={listing.id} listing={listing} presentation={presentation} />
          ))}
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-border bg-card px-6 py-12 text-center text-sm text-muted-foreground">
          Chưa có studio tại khu vực này.
        </p>
      )}
      {hasMore ? (
        <div className="flex justify-center pt-3">
          <Button
            type="button"
            variant="outline"
            className="w-60 border-primary text-primary hover:bg-primary/10 hover:text-primary"
            onClick={() => setVisible((current) => current + PAGE_SIZE)}
          >
            {t('home.loadMore')}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
