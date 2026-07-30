import { Heart, ImageIcon, Star } from 'lucide-react';
import { Link } from 'react-router';
import type { PublishStatus } from '@booking/contracts';

function compactCount(value: number): string {
  if (value < 1_000) return String(value);
  const compact = value / 1_000;
  return `${Number.isInteger(compact) ? compact : compact.toFixed(1)}K`;
}

export function ListingSummaryCell({
  href,
  title,
  photos,
  favoriteCount,
  ratingAvg,
  status,
}: {
  href: string;
  title: string;
  photos: string[];
  favoriteCount: number;
  ratingAvg: number | null;
  status: PublishStatus;
}) {
  return (
    <div className="flex min-w-72 items-center gap-3.5">
      <div className="flex h-14 w-[5.5rem] shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted text-muted-foreground">
        {photos[0] ? (
          <img src={photos[0]} alt="" className="size-full object-cover" loading="lazy" />
        ) : (
          <ImageIcon className="size-5" aria-hidden />
        )}
      </div>
      <div className="min-w-0 space-y-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <Link to={href} className="truncate font-semibold text-foreground hover:underline">
            {title}
          </Link>
          {status === 'draft' ? (
            <span className="shrink-0 text-xs text-muted-foreground">· Bản nháp</span>
          ) : null}
        </div>
        <div className="flex items-center gap-2 text-xs tabular-nums">
          <span className="inline-flex items-center gap-1 rounded-full bg-destructive/8 px-2 py-1 text-muted-foreground">
            <Heart className="size-3.5 fill-destructive text-destructive" aria-hidden />
            {compactCount(favoriteCount)}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-2 py-1 text-muted-foreground">
            <Star className="size-3.5 fill-warning text-warning" aria-hidden />
            {ratingAvg === null ? '—' : ratingAvg.toFixed(1)}
          </span>
        </div>
      </div>
    </div>
  );
}
