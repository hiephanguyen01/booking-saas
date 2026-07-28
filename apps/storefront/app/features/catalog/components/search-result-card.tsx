import { Heart, MapPin } from 'lucide-react';
import { Link } from 'react-router';
import { RatingStars } from '~/components/rating-stars';
import {
  rangeDates,
  withSearchContext,
  type EnrichedSearchListing,
  type StorefrontSearchState,
} from '~/features/search/lib/search-state';
import { NsI18n, useTranslation } from '~/lib/i18n';
import { storefrontPaths } from '~/constants/paths';
import { formatListingLocation, formatVnd } from '~/lib/ui';
import { clockHoursBetween } from '~/lib/time';
import { useLocale } from '~/hooks/use-locale';
import type { ListingFavoriteControl } from '~/features/catalog/lib/listing-card.types';

export function SearchResultCard({
  listing,
  state,
  favoriteControl,
}: {
  listing: EnrichedSearchListing;
  state: StorefrontSearchState;
  favoriteControl?: ListingFavoriteControl;
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
  const price = formatVnd(listing.priceFrom);
  const regularPrice = formatVnd(listing.regularPriceFrom);
  const discountPercent = calculateDiscountPercent(listing.regularPriceFrom, listing.priceFrom);
  const selectedDayCount = state.hasDailyRange ? rangeDates(state.from, state.to).length : 0;
  const selectedHours = state.hasTimeSelection
    ? clockHoursBetween(state.startTime, state.endTime)
    : null;

  return (
    <article className="group relative grid overflow-hidden rounded-lg border-[1.4px] border-border bg-card transition-[border-color,box-shadow] hover:border-primary/50 hover:shadow-md md:h-46 md:grid-cols-[248px_120px_minmax(0,1fr)] md:gap-x-1.5">
      {favoriteControl ? (
        <button
          type="button"
          aria-label={favoriteControl.label}
          aria-pressed={favoriteControl.selected}
          onClick={favoriteControl.onToggle}
          className="absolute top-3 right-3 z-10 flex size-8 items-center justify-center rounded-full bg-background text-primary shadow-md transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:top-6 md:right-auto md:left-[310px] md:size-10"
        >
          <Heart
            className="size-4 md:size-5"
            fill={favoriteControl.selected ? 'currentColor' : 'none'}
          />
        </button>
      ) : null}
      <Link
        to={href}
        className="relative min-h-52 overflow-hidden bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring md:min-h-0"
      >
        {photos[0] ? (
          <img
            src={photos[0]}
            alt={listing.title}
            width={720}
            height={480}
            loading="lazy"
            className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        ) : null}
        {discountPercent !== null ? (
          <span className="absolute top-6 left-0 flex h-10 w-18 items-center bg-primary px-2 text-base font-semibold text-primary-foreground [clip-path:polygon(0_0,100%_0,84%_50%,100%_100%,0_100%)]">
            - {discountPercent}%
          </span>
        ) : null}
      </Link>

      <div className="relative hidden grid-rows-2 gap-1.5 bg-muted md:grid">
        {[photos[1], photos[2]].map((photo, index) => (
          <div key={photo ?? index} className="min-h-0 overflow-hidden bg-muted">
            {photo ? (
              <img
                src={photo}
                alt=""
                width={360}
                height={264}
                loading="lazy"
                className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
              />
            ) : null}
          </div>
        ))}
      </div>

      <div className="flex min-w-0 flex-col justify-center gap-3 px-5 py-4 md:pr-6 md:pl-[18px]">
        <div className="min-w-0">
          <Link
            to={href}
            className="block truncate text-lg leading-7 font-semibold text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {listing.title}
          </Link>
          {location ? (
            <p className="mt-1 flex items-center gap-2 text-sm leading-5 text-muted-foreground">
              <MapPin className="size-5 shrink-0" aria-hidden="true" />
              <span className="truncate">{location}</span>
            </p>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-3 text-sm leading-5 text-muted-foreground">
          {listing.ratingAvg === null || listing.reviewCount === 0 ? (
            <span>{t('catalog:noReviews')}</span>
          ) : (
            <RatingStars rating={listing.ratingAvg} />
          )}
          <span className="shrink-0 text-right">
            {t('catalog:completedBookings', { count: listing.completedBookings })}
          </span>
        </div>

        <div className="flex items-end justify-end text-right">
          <p className="text-sm leading-5 text-muted-foreground">
            <span className="flex flex-wrap items-baseline justify-end gap-x-2">
              {discountPercent !== null && regularPrice ? (
                <span className="text-base leading-6 text-muted-foreground/65 line-through">
                  {regularPrice}
                </span>
              ) : null}
              <span className={discountPercent !== null ? 'text-primary' : 'text-foreground'}>
                {t('listing:fromPriceShort')}{' '}
                <strong className="text-lg leading-7 font-semibold">{price}</strong>
              </span>
            </span>
            <span
              className={`block ${discountPercent !== null ? 'text-primary' : 'text-muted-foreground'}`}
            >
              {state.hasDailyRange
                ? t('listing:forSelectedDays', { count: selectedDayCount })
                : listing.priceUnit === 'hour'
                  ? selectedHours
                    ? t('listing:forHours', { count: selectedHours })
                    : t('listing:perHour')
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

function calculateDiscountPercent(regularPrice: string, salePrice: string): number | null {
  const regular = BigInt(regularPrice);
  const sale = BigInt(salePrice);
  if (regular <= 0n || sale >= regular) return null;

  return Number(((regular - sale) * 100n + regular / 2n) / regular);
}
