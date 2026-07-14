import { useState } from 'react';
import type { PublicListingResponse } from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import { useT } from '../../lib/i18n';
import { ListingCard } from '../../features/catalog/components/listing-card';
import { LocationTabs } from './location-tabs';

const PAGE_SIZE = 8;

/**
 * "Đề xuất dành cho bạn" — flat grid of the remaining listings (after the
 * "Top 10" row) with a client-side "Xem thêm" reveal. No new fetch/route: it
 * pages through the array already loaded by the home route's SSR loader.
 */
export function RecommendedSection({ listings }: { listings: PublicListingResponse[] }) {
  const { t } = useT();
  const [visible, setVisible] = useState(PAGE_SIZE);
  if (listings.length === 0) return null;

  const shown = listings.slice(0, visible);
  const hasMore = visible < listings.length;

  return (
    <section>
      <h2 className="mb-5 text-lg font-semibold text-foreground">{t('common.home.recommended')}</h2>
      <LocationTabs />
      <div className="mt-6 grid grid-cols-2 gap-x-5 gap-y-8 md:grid-cols-3 lg:grid-cols-4">
        {shown.map((listing) => (
          <ListingCard key={listing.id} listing={listing} />
        ))}
      </div>
      {hasMore ? (
        <div className="mt-8 flex justify-center">
          <Button
            type="button"
            variant="outline"
            className="w-60 border-primary text-primary hover:bg-primary/10 hover:text-primary"
            onClick={() => setVisible((v) => v + PAGE_SIZE)}
          >
            {t('common.home.loadMore')}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
