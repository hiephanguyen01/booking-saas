import { NsI18n, useTranslation } from '@booking/i18n';
import { Image } from '@booking/ui/components/media/image';
import { cn } from '@booking/ui/lib/utils';
import { Heart, MapPin, X } from 'lucide-react';
import { Link } from 'react-router';
import { DiscountBadge } from '~/components/discount-badge';
import { RatingStars, RatingSummary } from '~/components/rating-stars';
import { storefrontPaths } from '~/constants/paths';
import { SURFACE_FRAME } from '~/constants/surfaces';
import type {
  DiscoveryListingCardData,
  ListingCardDismissControl,
  ListingFavoriteControl,
} from '~/features/catalog/lib/listing-card.types';
import { useLocale } from '~/hooks/use-locale';
import { formatListingLocation, formatVnd } from '~/lib/ui';

/**
 * The canonical image-forward card for every discovery surface. Its own width
 * selects the compact treatment, so the same component works in a 2-up mobile
 * grid, a carousel slide and a full desktop grid without caller-specific modes.
 */
export function ListingCard({
  item,
  className,
  favoriteControl,
  dismissControl,
}: {
  item: DiscoveryListingCardData;
  className?: string;
  favoriteControl?: ListingFavoriteControl;
  dismissControl?: ListingCardDismissControl;
}) {
  const locale = useLocale();
  const { t } = useTranslation(NsI18n.Listing);
  const { listing, presentation } = item;
  const cover = listing.photos[0] as string | undefined;
  const price = formatVnd(listing.priceFrom);
  const location = formatListingLocation(listing);
  const hasDiscount = presentation.discountPercent !== null;
  const originalPrice = presentation.originalPrice
    ? formatVnd(presentation.originalPrice)
    : null;

  return (
    <article
      className={cn(
        SURFACE_FRAME,
        'group/card @container relative flex h-full flex-col overflow-hidden bg-card',
        className,
      )}
    >
      <Link
        to={
          listing.kind === 'group'
            ? storefrontPaths.listingGroup(locale, listing.slug)
            : storefrontPaths.listing(locale, listing.slug)
        }
        className="group flex h-[calc(24.625rem_-_var(--sf-surface-border-width)_-_var(--sf-surface-border-width))] min-h-[calc(24.625rem_-_var(--sf-surface-border-width)_-_var(--sf-surface-border-width))] flex-1 flex-col focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring @max-[220px]:h-[calc(18rem_-_var(--sf-surface-border-width)_-_var(--sf-surface-border-width))] @max-[220px]:min-h-[calc(18rem_-_var(--sf-surface-border-width)_-_var(--sf-surface-border-width))] @max-[190px]:h-[calc(16rem_-_var(--sf-surface-border-width)_-_var(--sf-surface-border-width))] @max-[190px]:min-h-[calc(16rem_-_var(--sf-surface-border-width)_-_var(--sf-surface-border-width))]"
      >
        {/* No radius of its own: the cover is flush with the card's top edge, and the
            card is `overflow-hidden` with the tenant's `--sf-surface-radius`, so the
            card clips these corners at every width. Rounding here instead produced a
            visible rounded *bottom* edge floating mid-card — which is what the old
            `sm:rounded-none` was patching, and only from `sm` up. Worse, `sm:` is a
            viewport breakpoint while this card is a container-query context, so a
            narrow card on a wide screen took the wrong branch. */}
        <div className="relative h-46 shrink-0 overflow-hidden bg-muted @max-[220px]:h-34 @max-[190px]:h-28">
          {cover ? (
            <Image
              src={cover}
              alt={listing.title}
              width={720}
              height={480}
              className="h-full w-full object-cover object-top transition duration-500 ease-out group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center p-2 text-center text-sm text-muted-foreground @max-[220px]:text-xs">
              {listing.title}
            </div>
          )}
          {presentation.discountPercent !== null ? (
            <DiscountBadge
              percent={presentation.discountPercent}
              className="top-5 h-10 w-18 text-base font-semibold sm:h-10 sm:w-18 sm:text-base @max-[220px]:top-2.5 @max-[220px]:h-6 @max-[220px]:w-14 @max-[220px]:text-xs"
            />
          ) : null}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-3 p-(--sf-surface-pad) @max-[220px]:gap-2">
          <div className="flex flex-col gap-2 @max-[220px]:gap-1">
            <h3 className="line-clamp-2 text-lg leading-7 font-semibold text-foreground transition-colors group-hover:text-primary @max-[220px]:text-sm @max-[220px]:leading-5">
              {listing.title}
            </h3>
            {location ? (
              <p className="flex items-center gap-1 text-sm leading-5 text-muted-foreground @max-[220px]:text-xs">
                <MapPin className="size-5 shrink-0 @max-[220px]:size-3" aria-hidden="true" />
                <span className="truncate">{location}</span>
              </p>
            ) : null}
            {presentation.distanceMeters !== undefined ? (
              <p className="text-right text-xs font-bold text-success">
                {formatDistance(presentation.distanceMeters, locale)}
              </p>
            ) : null}
          </div>

          <DiscoveryListingMeta
            rating={listing.ratingAvg}
            ratingCount={listing.reviewCount}
            completedBookings={presentation.completedBookings}
          />

          {price ? (
            <div className="mt-auto text-right text-sm @max-[220px]:text-xs">
              <p className="flex flex-wrap items-baseline justify-end gap-x-1.5">
                {hasDiscount && originalPrice ? (
                  <span className="text-muted-foreground line-through">{originalPrice}</span>
                ) : null}
                <span className={hasDiscount ? 'text-brand-accent' : 'text-foreground'}>
                  <span className="font-normal">{t('fromPriceShort')} </span>
                  <span className="text-base font-bold @max-[220px]:text-sm">{price}</span>
                </span>
              </p>
              <p
                className={cn(
                  'mt-0.5 text-xs',
                  hasDiscount ? 'text-brand-accent' : 'text-muted-foreground',
                )}
              >
                {presentation.priceUnit
                  ? t(`priceUnit.${presentation.priceUnit}`)
                  : t('fromPrice')}
              </p>
            </div>
          ) : null}
        </div>
      </Link>

      {favoriteControl ? (
        <button
          type="button"
          aria-label={favoriteControl.label}
          aria-pressed={favoriteControl.selected}
          onClick={favoriteControl.onToggle}
          className={cn(CHIP_CLASS, DISCOVERY_HEART_PLACEMENT, 'text-primary')}
        >
          <Heart
            className="size-4.5 @max-[220px]:size-4"
            fill={favoriteControl.selected ? 'currentColor' : 'none'}
          />
        </button>
      ) : (
        <span
          aria-hidden="true"
          className={cn(CHIP_CLASS, DISCOVERY_HEART_PLACEMENT, 'text-primary')}
        >
          <Heart className="size-4.5 @max-[220px]:size-4" />
        </span>
      )}

      {dismissControl ? (
        <button
          type="button"
          aria-label={dismissControl.label}
          onClick={dismissControl.onDismiss}
          className={cn(
            CHIP_CLASS,
            DISCOVERY_DISMISS_PLACEMENT,
            'text-muted-foreground hover:text-foreground',
          )}
        >
          <X className="size-5 @max-[220px]:size-4" />
        </button>
      ) : null}
    </article>
  );
}

function DiscoveryListingMeta({
  rating,
  ratingCount,
  completedBookings,
}: {
  rating: number | null;
  ratingCount: number;
  completedBookings?: number;
}) {
  const { t } = useTranslation(NsI18n.Listing);
  const hasRating = rating !== null && ratingCount > 0;
  if (!hasRating && completedBookings === undefined) return null;

  return (
    <div className="flex min-h-5 items-center justify-between gap-2 text-sm leading-5 text-muted-foreground @max-[220px]:text-xs">
      {hasRating ? (
        <>
          <RatingStars rating={rating} className="@max-[220px]:hidden" />
          <RatingSummary
            rating={rating}
            count={ratingCount}
            className="hidden @max-[220px]:inline-flex"
          />
        </>
      ) : (
        <span aria-hidden="true" />
      )}
      {completedBookings !== undefined ? (
        <span className="shrink-0 text-right tabular-nums">
          {t('bookedCount', { count: completedBookings })}
        </span>
      ) : null}
    </div>
  );
}

const CHIP_CLASS =
  "absolute z-10 flex items-center justify-center rounded-full bg-background/95 shadow-md transition-transform after:absolute after:-inset-0.5 after:content-[''] hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

const DISCOVERY_HEART_PLACEMENT =
  'right-5 top-5 size-10 @max-[220px]:right-2.5 @max-[220px]:top-2.5 @max-[220px]:size-8';

const DISCOVERY_DISMISS_PLACEMENT =
  'left-5 top-5 size-10 @max-[220px]:left-2.5 @max-[220px]:top-2.5 @max-[220px]:size-8';

function formatDistance(distanceMeters: number, locale: string): string {
  if (distanceMeters < 1_000) return `${distanceMeters.toLocaleString(locale)} m`;
  return `${(distanceMeters / 1_000).toLocaleString(locale, { maximumFractionDigits: 1 })} km`;
}
