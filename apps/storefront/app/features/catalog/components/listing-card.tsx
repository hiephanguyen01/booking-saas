import { Heart, MapPin } from 'lucide-react';
import { Link } from 'react-router';
import type { PublicListingResponse } from '@booking/contracts';
import { attributeSummary, formatListingLocation, formatVnd } from '~/lib/ui';
import { NsI18n, useTranslation } from '@booking/i18n';
import { storefrontPaths } from '~/constants/paths';
import { useLocale } from '~/hooks/use-locale';
import type {
  ListingCardPresentation,
  ListingFavoriteControl,
} from '~/features/catalog/lib/listing-card.types';
import { RatingStars } from '~/components/rating-stars';
import { SaleCampaignBadge } from '~/components/sale-campaign-badge';
import { SaleCampaignRibbon } from '~/components/sale-campaign-banner';

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
      className={`group/card relative flex h-full min-h-80 flex-col overflow-hidden rounded-lg border-2 border-border bg-card ${className}`}
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
            <img
              src={cover}
              alt={listing.title}
              width={720}
              height={480}
              loading="lazy"
              className="h-full w-full object-cover transition duration-500 ease-out group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
              {listing.title}
            </div>
          )}
          <SaleCampaignRibbon campaign={listing.campaign} />
        </div>
        <div className="flex flex-1 flex-col gap-3 p-4">
          <div className="flex flex-col gap-2">
            <h3 className="line-clamp-2 text-lg leading-7 font-semibold text-foreground transition-colors group-hover:text-primary">
              {listing.title}
            </h3>
            <SaleCampaignBadge campaign={listing.campaign} />
            {location ? (
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <MapPin className="size-4 shrink-0" aria-hidden="true" />
                <span className="truncate">{location}</span>
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
                    presentation?.discountPercent ? 'text-warning-foreground' : 'text-foreground'
                  }
                >
                  <span className="font-normal">{t('fromPriceShort')} </span>
                  <span className="text-base font-semibold">{price}</span>
                </span>
              </p>
              <p
                className={`mt-1 ${
                  presentation?.discountPercent
                    ? 'text-warning-foreground'
                    : 'text-muted-foreground'
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
          className="absolute right-4 top-4 z-10 flex size-10 items-center justify-center rounded-full bg-background/95 text-primary shadow-md transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
