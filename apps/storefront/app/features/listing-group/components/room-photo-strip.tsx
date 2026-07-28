import { ImageIcon } from 'lucide-react';
import { NsI18n, useTranslation } from '~/lib/i18n';

export function RoomPhotoStrip({
  photos,
  title,
  onOpenPhoto,
}: {
  photos: string[];
  title: string;
  onOpenPhoto?: (index: number, trigger: HTMLButtonElement) => void;
}) {
  const { t } = useTranslation(NsI18n.Listing);
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
        label={t('group.goToPhoto', { index: 1 })}
      />
      {second ? (
        <RoomPhoto
          photo={second}
          title={title}
          index={1}
          onOpenPhoto={onOpenPhoto}
          label={t('group.goToPhoto', { index: 2 })}
        />
      ) : (
        <div className="bg-muted" />
      )}
      {third ? (
        <RoomPhoto
          photo={third}
          title={title}
          index={2}
          onOpenPhoto={onOpenPhoto}
          label={t('group.goToPhoto', { index: 3 })}
        />
      ) : (
        <div className="bg-muted" />
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
}: {
  photo: string;
  title: string;
  index: number;
  onOpenPhoto?: (index: number, trigger: HTMLButtonElement) => void;
  className?: string;
  label: string;
}) {
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
      className={`${className ?? ''} min-h-0 overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring`}
    >
      <img src={photo} alt={index === 0 ? title : ''} className="size-full object-cover" />
    </button>
  );
}
