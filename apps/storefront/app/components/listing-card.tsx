import { Heart } from 'lucide-react';
import { Link } from 'react-router';
import type { PublicListingResponse } from '@booking/shared';
import { attributeSummary, formatVnd } from '../lib/ui';

/**
 * Image-forward listing card used on the home + catalog pages. Visual chrome
 * (border, favorite button, price row styling) follows the Figma card design —
 * but rating stars, review count, a sale badge and struck-through original
 * price are intentionally NOT rendered: `PublicListingResponse` has no
 * rating/review/discount data behind it, and this card must not invent any.
 */
export function ListingCard({ listing }: { listing: PublicListingResponse }) {
  const cover = listing.photos[0] as string | undefined;
  const price = formatVnd(listing.priceFrom);
  const summary = attributeSummary(listing.attributes);

  return (
    <Link
      to={`/l/${listing.slug}`}
      className="group block overflow-hidden rounded-lg border-2 border-border bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <div className="relative aspect-3/2 overflow-hidden bg-muted">
        {cover ? (
          <img
            src={cover}
            alt={listing.title}
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
          className="absolute top-3 right-3 flex size-8 items-center justify-center rounded-full bg-background/95 text-foreground shadow-md"
        >
          <Heart className="size-4" />
        </span>
      </div>
      <div className="space-y-2 p-4">
        <h3 className="line-clamp-2 leading-snug font-semibold text-foreground transition-colors group-hover:text-primary">
          {listing.title}
        </h3>
        {summary ? <p className="line-clamp-1 text-sm text-muted-foreground">{summary}</p> : null}
        {price ? (
          <p className="text-right text-sm">
            <span className="font-semibold text-primary">từ {price}</span>{' '}
            <span className="text-muted-foreground">trở lên</span>
          </p>
        ) : null}
      </div>
    </Link>
  );
}
