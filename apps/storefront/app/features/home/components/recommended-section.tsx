import type { PublicListingResponse } from '@booking/contracts';
import { NsI18n, useTranslation } from '@booking/i18n';
import { Button } from '@booking/ui/components/ui/button';
import { HomeListingCardsSkeleton } from '~/components/loading-skeletons';
import { SectionHeading } from '~/components/section-heading';
import { FavoriteListingCard } from '~/features/favorites/components/favorite-cards';
import { useRecommendedSectionController } from '~/features/home/hooks/use-recommended-section-controller';
import { LocationTabs } from './location-tabs';

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
    <section className="flex flex-col gap-(--sf-section-gap) md:gap-4">
      <SectionHeading title={t('home.recommended')} />
      <LocationTabs value={location} onValueChange={changeLocation} />
      {pending ? (
        <HomeListingCardsSkeleton label={t('loading')} count={8} layout="grid" />
      ) : shown.length > 0 ? (
        // Two up on a phone. One card per row spent ~250px on a single result and
        // pushed everything under this section below three screenfuls of scroll;
        // the card already has a compact treatment for exactly this width.
        <div className="grid grid-cols-2 gap-3 sm:gap-x-5 sm:gap-y-5 md:grid-cols-3 lg:grid-cols-4">
          {shown.map((listing) => (
            <FavoriteListingCard key={listing.id} listing={listing} layout="stacked" />
          ))}
        </div>
      ) : (
        <p className="rounded-(--sf-surface-radius) [border:var(--sf-surface-border-width)_dashed_var(--sf-surface-border-color)] bg-card p-(--sf-surface-pad) text-center text-sm text-muted-foreground shadow-(--sf-surface-shadow) md:px-6 md:py-12">
          {t('home.emptyInLocation')}
        </p>
      )}
      {!pending && hasMore ? (
        <Button
          type="button"
          variant="outline"
          className="w-full border-primary/40 font-semibold text-primary hover:bg-primary/10 hover:text-primary sm:mx-auto sm:w-60"
          onClick={loadMore}
        >
          {t('home.loadMore')}
        </Button>
      ) : null}
    </section>
  );
}
