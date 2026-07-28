import type { PublicListingResponse } from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import { HomeListingCardsSkeleton } from '~/components/loading-skeletons';
import { FavoriteListingCard } from '~/features/favorites/components/favorite-cards';
import { NsI18n, useTranslation } from '@booking/i18n';
import { LocationTabs } from './location-tabs';
import { useRecommendedSectionController } from '~/features/home/hooks/use-recommended-section-controller';

/**
 * "Đề xuất dành cho bạn" — location-filtered catalog with a client-side
 * "Xem thêm" reveal. No new fetch/route: it
 * pages through the array already loaded by the home route's SSR loader.
 */
export function RecommendedSection({
  listings,
  pending,
}: {
  listings: PublicListingResponse[];
  pending: boolean;
}) {
  const { t } = useTranslation(NsI18n.Common);
  const { changeLocation, hasMore, loadMore, location, shown } =
    useRecommendedSectionController(listings);

  if (!pending && listings.length === 0) return null;

  return (
    <section className="flex flex-col gap-6">
      <div className="min-h-29 bg-card px-4 pt-6 pb-1 font-studio shadow-sm sm:px-6">
        <h2 className="text-lg leading-7 font-semibold text-foreground">{t('home.recommended')}</h2>
        <LocationTabs value={location} onValueChange={changeLocation} />
      </div>
      {pending ? (
        <HomeListingCardsSkeleton label={t('loading')} count={8} layout="grid" />
      ) : shown.length > 0 ? (
        <div className="grid grid-cols-1 gap-x-5 gap-y-5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {shown.map((listing) => (
            <FavoriteListingCard key={listing.id} listing={listing} />
          ))}
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-border bg-card px-6 py-12 text-center text-sm text-muted-foreground">
          {t('home.emptyInLocation')}
        </p>
      )}
      {!pending && hasMore ? (
        <div className="flex justify-center pt-3">
          <Button
            type="button"
            variant="outline"
            className="w-60 border-primary text-primary hover:bg-primary/10 hover:text-primary"
            onClick={loadMore}
          >
            {t('home.loadMore')}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
