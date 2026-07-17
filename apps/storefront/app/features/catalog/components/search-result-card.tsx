import { Heart, MapPin } from 'lucide-react';
import { Link } from 'react-router';
import {
  rangeDates,
  withSearchContext,
  type EnrichedSearchListing,
  type StorefrontSearchState,
} from '../../search/search-state';
import { NsI18n, useTranslation } from '../../../lib/i18n';
import { storefrontPaths } from '../../../lib/locale-paths';
import { formatListingLocation, formatVnd } from '../../../lib/ui';
import { useLocale } from '../../../lib/use-locale';

export function SearchResultCard({
  listing,
  state,
}: {
  listing: EnrichedSearchListing;
  state: StorefrontSearchState;
}) {
  const locale = useLocale();
  const { t } = useTranslation([NsI18n.Catalog, NsI18n.Listing]);
  const detailPath =
    listing.kind === 'group'
      ? storefrontPaths.listingGroup(locale, listing.slug)
      : storefrontPaths.listing(locale, listing.slug);
  const href = withSearchContext(detailPath, state);
  const photos = listing.photos.slice(0, 3);
  const location = formatListingLocation(listing);
  const selectedDayCount = state.hasDailyRange ? rangeDates(state.from, state.to).length : 0;

  return (
    <article className="group grid overflow-hidden rounded-lg border border-border bg-background transition-[border-color,box-shadow] hover:border-primary/50 hover:shadow-md md:h-46 md:grid-cols-[248px_120px_minmax(0,1fr)]">
      <Link
        to={href}
        className="relative min-h-52 overflow-hidden bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring md:min-h-0"
      >
        {photos[0] ? (
          <img
            src={photos[0]}
            alt={listing.title}
            className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        ) : null}
      </Link>

      <div className="relative hidden grid-rows-2 gap-1.5 bg-muted md:grid">
        {photos.slice(1, 3).map((photo) => (
          <img key={photo} src={photo} alt="" className="size-full min-h-0 object-cover" />
        ))}
        {/* Decorative only — no wishlist backend exists yet, so this doesn't persist state. */}
        <span
          aria-hidden
          className="absolute right-3 top-6 flex size-8 items-center justify-center rounded-full bg-background text-primary shadow-md"
        >
          <Heart className="size-4" />
        </span>
      </div>

      <div className="flex min-w-0 flex-col justify-center gap-3 px-5 py-4">
        <div className="min-w-0">
          <Link
            to={href}
            className="block truncate text-base font-semibold text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {listing.title}
          </Link>
          {location ? (
            <p className="mt-1.5 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
              <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
              {location}
            </p>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>{t('catalog:noReviews')}</span>
          <span>{t('catalog:matchingRooms', { count: listing.matchingRoomCount })}</span>
        </div>

        <div className="flex items-end justify-end text-right">
          <p className="text-xs text-muted-foreground">
            {listing.regularPriceFrom !== listing.priceFrom ? (
              <span className="mb-0.5 block line-through">
                {formatVnd(listing.regularPriceFrom)}
              </span>
            ) : null}
            {t('listing:fromPriceShort')}{' '}
            <strong className="text-base font-semibold text-primary">
              {formatVnd(listing.priceFrom)}
            </strong>
            <span className="block text-primary">
              {state.hasDailyRange
                ? t('listing:forSelectedDays', { count: selectedDayCount })
                : listing.priceUnit === 'hour'
                  ? t('listing:perHour')
                  : listing.priceUnit === 'item'
                    ? t('listing:perItem')
                    : listing.priceUnit === 'session'
                      ? t('listing:perSession')
                      : t('listing:perDay')}
            </span>
          </p>
        </div>
      </div>
    </article>
  );
}
