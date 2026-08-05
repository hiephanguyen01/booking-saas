import { Heart, MapPin } from 'lucide-react';
import { Link } from 'react-router';
import type { PublicListingResponse } from '@booking/contracts';
import { Image } from '@booking/ui/components/media/image';
import { attributeSummary, formatListingLocation, formatVnd } from '~/lib/ui';
import { NsI18n, useTranslation } from '@booking/i18n';
import { storefrontPaths } from '~/constants/paths';
import { useLocale } from '~/hooks/use-locale';
import type {
  ListingCardPresentation,
  ListingFavoriteControl,
} from '~/features/catalog/lib/listing-card.types';
import { RatingStars } from '~/components/rating-stars';
import { DiscountBadge } from '~/components/discount-badge';

/**
 * Image-forward listing card used on the home + catalog pages.
 *
 * The default Home/catalog rendering only uses `PublicListingResponse`.
 * Optional presentation metadata exists only for callers that have explicit
 * real values; the card never derives business data from a listing id.
 */
export function ListingCard({
  listing,
  className = '',
  favoriteControl,
  presentation,
}: {
  listing: PublicListingResponse;
  className?: string;
  favoriteControl?: ListingFavoriteControl;
  presentation?: ListingCardPresentation;
}) {
  const locale = useLocale();
  const { t } = useTranslation(NsI18n.Listing);
  const cover = listing.photos[0] as string | undefined;
  const price = formatVnd(listing.priceFrom);
  const summary = attributeSummary(listing.attributes);
  const location = formatListingLocation(listing);
  const rating = listing.ratingAvg;
  const ratingCount = listing.reviewCount;

  const originalPrice = presentation?.originalPrice ? formatVnd(presentation.originalPrice) : null;

  return (
    <article
      className={`group/card relative flex h-full min-h-80 flex-col overflow-hidden bg-card rounded-(--sf-surface-radius) [border:var(--sf-surface-border-width)_solid_var(--sf-surface-border-color)] shadow-(--sf-surface-shadow) ${className}`}
    >
      <Link
        to={
          listing.kind === 'group'
            ? storefrontPaths.listingGroup(locale, listing.slug)
            : storefrontPaths.listing(locale, listing.slug)
        }
        className="group flex h-full flex-1 flex-col focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <div className="relative h-46 shrink-0 overflow-hidden bg-muted">
          {cover ? (
            <Image
              src={cover}
              alt={listing.title}
              width={720}
              height={480}
              className="h-full w-full object-cover object-top transition duration-500 ease-out group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
              {listing.title}
            </div>
          )}
          {presentation?.discountPercent ? (
            <DiscountBadge percent={presentation.discountPercent} />
          ) : null}
        </div>
        <div className="flex flex-1 flex-col gap-3 p-4">
          <div className="flex flex-col gap-2">
            <h3 className="line-clamp-2 text-lg leading-7 font-semibold text-foreground transition-colors group-hover:text-primary">
              {listing.title}
            </h3>
            {location ? (
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <MapPin className="size-4 shrink-0" aria-hidden="true" />
                <span className="truncate">{location}</span>
              </p>
            ) : null}
            {presentation?.distanceMeters !== undefined ? (
              <p className="text-xs font-medium text-primary">
                {formatDistance(presentation.distanceMeters, locale)}
              </p>
            ) : null}
          </div>
          {rating !== null && ratingCount > 0 ? (
            <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
              <RatingStars rating={rating} />
              <span>
                {rating.toFixed(1)} · {t('reviewCount', { count: ratingCount })}
              </span>
            </div>
          ) : summary ? (
            <p className="line-clamp-1 text-sm text-muted-foreground">{summary}</p>
          ) : null}
          {price && presentation ? (
            <div className="mt-auto text-right text-sm">
              <p>
                {originalPrice ? (
                  <span className="mr-2 text-muted-foreground line-through">{originalPrice}</span>
                ) : null}
                <span
                  className={
                    presentation?.discountPercent ? 'text-brand-accent' : 'text-foreground'
                  }
                >
                  <span className="font-normal">{t('fromPriceShort')} </span>
                  <span className="text-base font-semibold">{price}</span>
                </span>
              </p>
              <p
                className={`mt-1 ${
                  presentation?.discountPercent ? 'text-brand-accent' : 'text-muted-foreground'
                }`}
              >
                {presentation?.priceUnit
                  ? t(`priceUnit.${presentation.priceUnit}`)
                  : t('fromPrice')}
              </p>
            </div>
          ) : price ? (
            <p className="mt-auto text-right text-sm">
              <span className="font-semibold text-primary">
                {t('fromPriceShort')} {price}
              </span>{' '}
              <span className="text-muted-foreground">{t('fromPrice')}</span>
            </p>
          ) : null}
        </div>
      </Link>
      {favoriteControl ? (
        <button
          type="button"
          aria-label={favoriteControl.label}
          aria-pressed={favoriteControl.selected}
          onClick={favoriteControl.onToggle}
          // The `after` box widens the 40px chip to a 44px tap target without
          // growing the circle the design places over the photo.
          className="absolute right-4 top-4 z-10 flex size-10 items-center justify-center rounded-full bg-background/95 text-primary shadow-md transition-transform after:absolute after:-inset-0.5 after:content-[''] hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <Heart className="size-5" fill={favoriteControl.selected ? 'currentColor' : 'none'} />
        </button>
      ) : (
        <span
          aria-hidden="true"
          className="absolute right-4 top-4 z-10 flex size-10 items-center justify-center rounded-full bg-background/95 text-primary shadow-md"
        >
          <Heart className="size-5" />
        </span>
      )}
    </article>
  );
}

function formatDistance(distanceMeters: number, locale: string): string {
  if (distanceMeters < 1_000) return `${distanceMeters.toLocaleString(locale)} m`;
  return `${(distanceMeters / 1_000).toLocaleString(locale, { maximumFractionDigits: 1 })} km`;
}
