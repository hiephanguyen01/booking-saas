import { cn } from '@booking/ui/lib/utils';

export interface PhotoStripProps {
  /** Image URLs. An empty list renders nothing. */
  photos: string[];
  /** Base alt text; each thumbnail is numbered from it. */
  alt?: string;
  className?: string;
}

/**
 * A responsive row of square thumbnails (object-cover), each opening the full
 * image in a new tab. Replaces the hand-rolled 112px `alt=""` image grids on the
 * moderation/review pages.
 */
export function PhotoStrip({ photos, alt, className }: PhotoStripProps) {
  if (photos.length === 0) return null;
  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {photos.map((src, i) => (
        <a
          key={`${src}-${i}`}
          href={src}
          target="_blank"
          rel="noreferrer"
          className="group relative block size-28 overflow-hidden rounded-md border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <img
            src={src}
            alt={alt ? `${alt} ${i + 1}` : `Ảnh ${i + 1}`}
            loading="lazy"
            className="size-full object-cover transition group-hover:opacity-90"
          />
        </a>
      ))}
    </div>
  );
}
