import { ImageIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { NsI18n, useTranslation } from '@booking/i18n';

/**
 * Compact gallery shared by listing and booking surfaces: one large cover plus two
 * thumbnails, or a placeholder when there are no photos.
 *
 * `photoLabel` and `coverBadge` exist because the package table needs its own
 * aria-label wording and an expand affordance on the cover; everything else about
 * the two strips was identical.
 */
export function RoomPhotoStrip({
  photos,
  title,
  onOpenPhoto,
  coverBadge,
  photoLabel,
}: {
  photos: string[];
  title: string;
  onOpenPhoto?: (index: number, trigger: HTMLButtonElement) => void;
  coverBadge?: ReactNode;
  photoLabel?: (oneBasedIndex: number) => string;
}) {
  const { t } = useTranslation(NsI18n.Listing);
  const label = photoLabel ?? ((index: number) => t('group.goToPhoto', { index }));
  const [cover, second, third] = photos;

  if (!cover)
    return (
      <div className="grid h-36 place-items-center rounded-md bg-muted text-muted-foreground">
        <ImageIcon className="size-7" aria-hidden="true" />
        <span className="sr-only">{title}</span>
      </div>
    );

  return (
    <div className="grid h-36 grid-cols-[2fr_1fr] grid-rows-2 gap-1.5 overflow-hidden rounded-md">
      <RoomPhoto
        photo={cover}
        title={title}
        index={0}
        onOpenPhoto={onOpenPhoto}
        className="row-span-2"
        label={label(1)}
        badge={coverBadge}
      />
      {[second, third].map((photo, offset) =>
        photo ? (
          <RoomPhoto
            key={photo}
            photo={photo}
            title={title}
            index={offset + 1}
            onOpenPhoto={onOpenPhoto}
            label={label(offset + 2)}
          />
        ) : (
          <div key={offset} className="bg-muted" />
        ),
      )}
    </div>
  );
}

function RoomPhoto({
  photo,
  title,
  index,
  onOpenPhoto,
  className,
  label,
  badge,
}: {
  photo: string;
  title: string;
  index: number;
  onOpenPhoto?: (index: number, trigger: HTMLButtonElement) => void;
  className?: string;
  label: string;
  badge?: ReactNode;
}) {
  const image = (
    <img src={photo} alt={index === 0 ? title : ''} className="size-full object-cover" />
  );

  if (!onOpenPhoto) {
    return (
      <img
        src={photo}
        alt={index === 0 ? title : ''}
        className={`${className ?? ''} size-full object-cover`}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={(event) => onOpenPhoto(index, event.currentTarget)}
      aria-label={label}
      className={`${className ?? ''} relative min-h-0 overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring`}
    >
      {image}
      {badge}
    </button>
  );
}
