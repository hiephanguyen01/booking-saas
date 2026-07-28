import {
  MediaViewerDialog,
  type MediaViewerItem,
} from '@booking/ui/components/media/media-viewer-dialog';
import { Expand, ImageIcon } from 'lucide-react';
import { NsI18n, useTranslation } from '~/lib/i18n';
import { useMediaViewerLabels } from '~/lib/use-media-viewer-labels';
import { useStudioGalleryController } from './use-studio-gallery-controller';

const TILE_COUNT = 6;

export function StudioGallery({ photos, title }: { photos: string[]; title: string }) {
  const { t } = useTranslation(NsI18n.Listing);
  const viewerLabels = useMediaViewerLabels();
  const {
    activeIndex,
    open,
    overflowCount,
    setActiveIndex,
    setOpen,
    showPhoto,
    triggerRef,
    visiblePhotos,
  } = useStudioGalleryController(photos);
  const mediaItems: MediaViewerItem[] = photos.map((photo, index) => ({
    kind: 'image',
    url: photo,
    alt: t('group.photoAlt', { title, index: index + 1 }),
  }));

  return (
    <>
      <div className="grid h-64 overflow-hidden rounded-md bg-muted md:h-85 md:grid-cols-[460px_1fr] md:gap-3">
        <button
          type="button"
          onClick={(event) => showPhoto(0, event.currentTarget)}
          disabled={!visiblePhotos[0]}
          className="group relative min-h-64 overflow-hidden text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring md:min-h-0"
          aria-label={
            visiblePhotos[0] ? t('group.viewMainPhoto', { title }) : t('group.noPhotoOf', { title })
          }
        >
          {visiblePhotos[0] ? (
            <img
              src={visiblePhotos[0]}
              alt={title}
              width={920}
              height={680}
              className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            />
          ) : (
            <GalleryPlaceholder title={title} />
          )}
          {visiblePhotos[0] ? (
            <span className="absolute right-4 bottom-4 grid size-11 place-items-center rounded-full bg-card/95 shadow-sm">
              <Expand className="size-4" aria-hidden="true" />
            </span>
          ) : null}
        </button>
        <div className="hidden grid-cols-3 grid-rows-2 gap-3 md:grid">
          {Array.from({ length: TILE_COUNT }, (_, index) => {
            const photo = visiblePhotos[index + 1];
            const isLast = index === TILE_COUNT - 1;
            return (
              <button
                type="button"
                key={photo ?? `placeholder-${index}`}
                onClick={(event) => showPhoto(index + 1, event.currentTarget)}
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
                {isLast && overflowCount > 0 ? (
                  <span className="absolute inset-0 grid place-items-center bg-foreground/55 text-lg font-semibold text-background">
                    +{overflowCount}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
      <MediaViewerDialog
        open={open}
        items={mediaItems}
        activeIndex={activeIndex}
        onOpenChange={setOpen}
        onActiveIndexChange={setActiveIndex}
        labels={viewerLabels}
        title={title}
        description={t('group.photoCounter', {
          current: activeIndex + 1,
          total: Math.max(photos.length, 1),
        })}
        returnFocusRef={triggerRef}
      />
    </>
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
