import { Button } from '@booking/ui/components/ui/button';
import { Heart, MapPin, Star } from 'lucide-react';
import { Link } from 'react-router';
import { withSearchContext, type EnrichedSearchListing, type StorefrontSearchState } from '../../search/search-state';
import { storefrontPaths } from '../../../lib/locale-paths';
import { formatVnd } from '../../../lib/ui';
import { useLocale } from '../../../lib/use-locale';

export function SearchResultCard({ listing, state }: { listing: EnrichedSearchListing; state: StorefrontSearchState }) {
  const locale = useLocale();
  const detailPath = listing.kind === 'group'
    ? storefrontPaths.listingGroup(locale, listing.slug)
    : storefrontPaths.listing(locale, listing.slug);
  const href = withSearchContext(detailPath, state);
  const photos = listing.photos.slice(0, 3);

  return (
    <article className="group grid overflow-hidden rounded-lg border border-border bg-background transition-[border-color,box-shadow] hover:border-primary/50 hover:shadow-md md:h-46 md:grid-cols-[248px_120px_minmax(0,1fr)]">
      <Link to={href} className="relative min-h-52 overflow-hidden bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring md:min-h-0">
        {photos[0] ? <img src={photos[0]} alt={listing.title} className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.02]" /> : null}
      </Link>

      <div className="relative hidden grid-rows-2 gap-1.5 bg-muted md:grid">
        {photos.slice(1, 3).map((photo) => <img key={photo} src={photo} alt="" className="size-full min-h-0 object-cover" />)}
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          className="absolute right-3 top-6 rounded-full border-0 bg-background text-primary shadow-md hover:bg-primary/10 hover:text-primary"
          aria-label="Thêm vào danh sách yêu thích"
        >
          <Heart className="size-4" />
        </Button>
      </div>

      <div className="flex min-w-0 flex-col justify-center gap-3 px-5 py-4">
        <div className="min-w-0">
          <Link to={href} className="block truncate text-base font-semibold text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {listing.title}
          </Link>
          <p className="mt-1.5 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
            <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
            {listing.address ?? listing.workingArea}
          </p>
        </div>

        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Star className="size-4" aria-hidden="true" /> Chưa có đánh giá
          </span>
          <span>{listing.matchingRoomCount} phòng phù hợp</span>
        </div>

        <div className="flex items-end justify-end text-right">
          <p className="text-xs text-muted-foreground">
            từ <strong className="text-base font-semibold text-primary">{formatVnd(listing.priceFrom)}</strong>
            <span className="block text-primary">cho 1 {listing.priceUnit}</span>
          </p>
        </div>
      </div>
    </article>
  );
}
