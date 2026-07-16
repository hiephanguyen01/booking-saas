import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@booking/ui/components/ui/dialog';
import { cn } from '@booking/ui/lib/utils';
import { Expand, ImageIcon } from 'lucide-react';
import { useState } from 'react';
import { NsI18n, useTranslation } from '../../../lib/i18n';

const TILE_COUNT = 6;
const VISIBLE_COUNT = TILE_COUNT + 1;

export function StudioGallery({ photos, title }: { photos: string[]; title: string }) {
  const { t } = useTranslation(NsI18n.Listing);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const visible = photos.slice(0, VISIBLE_COUNT);
  const overflow = Math.max(0, photos.length - VISIBLE_COUNT);

  function show(index: number): void {
    if (!photos[index]) return;
    setActiveIndex(index);
    setOpen(true);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <div className="grid h-64 overflow-hidden rounded-md bg-muted md:h-85 md:grid-cols-[460px_1fr] md:gap-3">
        <button
          type="button"
          onClick={() => show(0)}
          disabled={!visible[0]}
          className="group relative min-h-64 overflow-hidden text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring md:min-h-0"
          aria-label={
            visible[0] ? t('group.viewMainPhoto', { title }) : t('group.noPhotoOf', { title })
          }
        >
          {visible[0] ? (
            <img
              src={visible[0]}
              alt={title}
              width={920}
              height={680}
              className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            />
          ) : (
            <GalleryPlaceholder title={title} />
          )}
          {visible[0] ? (
            <span className="absolute right-4 bottom-4 grid size-11 place-items-center rounded-full bg-card/95 shadow-sm">
              <Expand className="size-4" aria-hidden="true" />
            </span>
          ) : null}
        </button>
        <div className="hidden grid-cols-3 grid-rows-2 gap-3 md:grid">
          {Array.from({ length: TILE_COUNT }, (_, index) => {
            const photo = visible[index + 1];
            const isLast = index === TILE_COUNT - 1;
            return (
              <button
                type="button"
                key={photo ?? `placeholder-${index}`}
                onClick={() => show(index + 1)}
                disabled={!photo}
                className="relative overflow-hidden bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                aria-label={
                  photo ? t('group.viewPhoto', { index: index + 2, title }) : t('group.noPhoto')
                }
              >
                {photo ? (
                  <img
                    src={photo}
                    alt=""
                    width={430}
                    height={328}
                    className="size-full object-cover"
                  />
                ) : (
                  <GalleryPlaceholder />
                )}
                {isLast && overflow > 0 ? (
                  <span className="absolute inset-0 grid place-items-center bg-foreground/55 text-lg font-semibold text-background">
                    +{overflow}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
      <DialogContent className="max-h-[90vh] gap-4 overflow-hidden p-4 sm:max-w-5xl">
        <DialogHeader className="pr-10">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {t('group.photoCounter', {
              current: activeIndex + 1,
              total: Math.max(photos.length, 1),
            })}
          </DialogDescription>
        </DialogHeader>
        {photos[activeIndex] ? (
          <img
            src={photos[activeIndex]}
            alt={t('group.photoAlt', { title, index: activeIndex + 1 })}
            width={1400}
            height={1000}
            className="max-h-[68vh] w-full rounded-md object-contain"
          />
        ) : (
          <div className="h-80">
            <GalleryPlaceholder title={title} />
          </div>
        )}
        {photos.length > 1 ? (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {photos.map((photo, index) => (
              <button
                type="button"
                key={`${photo}-${index}`}
                onClick={() => setActiveIndex(index)}
                aria-label={t('group.goToPhoto', { index: index + 1 })}
                aria-current={index === activeIndex ? 'true' : undefined}
                className={cn(
                  'h-16 w-24 shrink-0 overflow-hidden rounded-md border-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  index === activeIndex ? 'border-primary' : 'border-transparent',
                )}
              >
                <img src={photo} alt="" className="size-full object-cover" />
              </button>
            ))}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export function GalleryPlaceholder({ title }: { title?: string }) {
  return (
    <span className="grid size-full place-items-center bg-muted text-muted-foreground">
      <span className="flex flex-col items-center gap-2">
        <ImageIcon className="size-7" aria-hidden="true" />
        {title ? <span className="text-sm">{title}</span> : null}
      </span>
    </span>
  );
}
