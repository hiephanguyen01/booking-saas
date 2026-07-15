import { Badge } from '@booking/ui/components/ui/badge';
import { Button } from '@booking/ui/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@booking/ui/components/ui/tooltip';
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
    <article className="group grid overflow-hidden rounded-md border bg-background shadow-sm transition-shadow hover:shadow-md md:grid-cols-[310px_minmax(0,1fr)]">
      <Link to={href} className="grid min-h-56 grid-cols-3 grid-rows-2 gap-0.5 bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:h-64">
        {photos[0] ? <img src={photos[0]} alt={listing.title} className="col-span-2 row-span-2 size-full object-cover" /> : <div className="col-span-3 row-span-2 flex items-center justify-center text-muted-foreground">{listing.title}</div>}
        {photos.slice(1).map((photo) => <img key={photo} src={photo} alt="" className="hidden size-full object-cover sm:block" />)}
      </Link>
      <div className="flex min-w-0 flex-col gap-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link to={href} className="text-lg font-semibold text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{listing.title}</Link>
            {listing.address || listing.workingArea ? <p className="mt-1 flex items-start gap-1.5 text-sm text-muted-foreground"><MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{listing.address ?? listing.workingArea}</p> : null}
          </div>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild><Button variant="ghost" size="icon" disabled aria-label="Yêu thích, sắp ra mắt"><Heart /></Button></TooltipTrigger>
              <TooltipContent>Sắp ra mắt</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{listing.matchingRoomCount} phòng phù hợp</Badge>
          {listing.amenities.slice(0, 3).map((amenity) => <Badge key={amenity} variant="outline">{amenity}</Badge>)}
        </div>
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground"><Star className="size-4" aria-hidden="true" /> Chưa có đánh giá</p>
        <div className="mt-auto flex flex-wrap items-end justify-between gap-3">
          <p className="text-sm text-muted-foreground">Giá từ <strong className="text-xl text-primary">{formatVnd(listing.priceFrom)}</strong> / {listing.priceUnit}</p>
          <Button asChild><Link to={href}>Xem phòng phù hợp</Link></Button>
        </div>
      </div>
    </article>
  );
}
