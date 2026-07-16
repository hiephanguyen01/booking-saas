import { Heart, MapPin } from 'lucide-react';
import { Link } from 'react-router';
import type { PublicListingResponse } from '@booking/contracts';
import { attributeSummary, formatListingLocation, formatVnd } from '../../../lib/ui';
import { NsI18n, useTranslation } from '../../../lib/i18n';
import { storefrontPaths } from '../../../lib/locale-paths';
import { useLocale } from '../../../lib/use-locale';

/**
 * Image-forward listing card used on the home + catalog pages.
 *
 * Everything it renders comes from `PublicListingResponse`. It previously also
 * accepted a `presentation` prop carrying a rating, booking count, discount
 * percentage and strikethrough "original" price — all four were derived from a
 * hash of the listing id and shown on real listings, so they were removed
 * rather than reformatted. Reinstate them here once the public contract
 * exposes the real values.
 */
export function ListingCard({ listing }: { listing: PublicListingResponse }) {
  const locale = useLocale();
  const { t } = useTranslation(NsI18n.Listing);
  const cover = listing.photos[0] as string | undefined;
  const price = formatVnd(listing.priceFrom);
  const summary = attributeSummary(listing.attributes);
  const location = formatListingLocation(listing);

  return (
    <Link
      to={
        listing.kind === 'group'
          ? storefrontPaths.listingGroup(locale, listing.slug)
          : storefrontPaths.listing(locale, listing.slug)
      }
      className="group flex h-full min-h-80 flex-col overflow-hidden rounded-lg border-2 border-border bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
        {/* Decorative only — no wishlist backend exists yet, so this doesn't persist state. */}
        <span
          aria-hidden
          className="absolute top-4 right-4 flex size-10 items-center justify-center rounded-full bg-background/95 text-primary shadow-md"
        >
          <Heart className="size-5" />
        </span>
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
        </div>
        {summary ? <p className="line-clamp-1 text-sm text-muted-foreground">{summary}</p> : null}
        {price ? (
          <p className="mt-auto text-right text-sm">
            <span className="font-semibold text-primary">
              {t('fromPriceShort')} {price}
            </span>{' '}
            <span className="text-muted-foreground">{t('fromPrice')}</span>
          </p>
        ) : null}
      </div>
    </Link>
  );
}
