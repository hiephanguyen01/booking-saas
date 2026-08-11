import { MediaViewerDialog } from '@booking/ui/components/media/media-viewer-dialog';
import { Image } from '@booking/ui/components/media/image';
import { usePhotoMediaItems } from '~/hooks/use-media-gallery';
import { Expand, ImageIcon } from 'lucide-react';
import { useMediaViewerLabels } from '~/hooks/use-media-viewer-labels';
import { useListingGalleryController } from '~/hooks/use-listing-gallery-controller';
import { NsI18n, useTranslation } from '@booking/i18n';
import { cn } from '@booking/ui/lib/utils';

const TILE_COUNT = 6;

export function ListingGallery({ photos, title }: { photos: string[]; title: string }) {
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
  } = useListingGalleryController(photos);
  const mediaItems = usePhotoMediaItems(photos, title);
  const activePhoto = photos[activeIndex] ?? photos[0];

  return (
    <>
      <div className="bg-muted md:hidden">
        <button
          type="button"
          onClick={(event) => showPhoto(activeIndex, event.currentTarget)}
          disabled={!activePhoto}
          className="group relative block h-60 w-full overflow-hidden text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          aria-label={
            activePhoto ? t('group.viewMainPhoto', { title }) : t('group.noPhotoOf', { title })
          }
        >
          {activePhoto ? (
            <Image
              src={activePhoto}
              alt={title}
              width={780}
              height={480}
              priority
              className="block size-full object-cover object-top"
            />
          ) : (
            <GalleryPlaceholder title={title} />
          )}
          {activePhoto ? (
            <span className="absolute right-3 bottom-3 rounded-full bg-foreground/80 px-2.5 py-1 text-[11px] font-semibold text-background backdrop-blur-sm">
              {t('group.photoCounter', { current: activeIndex + 1, total: photos.length })}
            </span>
          ) : null}
        </button>
        {photos.length > 1 ? (
          <div className="sf-scroll-x flex gap-2 overflow-x-auto bg-card px-3 py-3">
            {photos.slice(0, 12).map((photo, index) => (
              <button
                type="button"
                key={`${photo}-${index}`}
                onClick={() => setActiveIndex(index)}
                aria-label={t('group.viewPhoto', { index: index + 1, title })}
                aria-current={activeIndex === index ? 'true' : undefined}
                className={cn(
                  'relative h-14 w-18 shrink-0 overflow-hidden rounded-(--sf-image-radius) border-2 border-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  activeIndex === index && 'border-primary',
                )}
              >
                <Image
                  src={photo}
                  alt=""
                  width={144}
                  height={112}
                  className="block size-full object-cover object-top"
                />
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <div className="hidden h-64 min-w-0 overflow-hidden bg-muted rounded-(--sf-image-radius) md:grid md:h-85 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:gap-3">
        <button
          type="button"
          onClick={(event) => showPhoto(0, event.currentTarget)}
          disabled={!visiblePhotos[0]}
          className="group relative min-h-64 min-w-0 overflow-hidden text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring md:min-h-0"
          aria-label={
            visiblePhotos[0] ? t('group.viewMainPhoto', { title }) : t('group.noPhotoOf', { title })
          }
        >
          {visiblePhotos[0] ? (
            <Image
              src={visiblePhotos[0]}
              alt={title}
              width={920}
              height={680}
              priority
              className="block size-full object-cover object-top transition-transform duration-300 group-hover:scale-[1.02]"
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
        <div className="hidden min-h-0 min-w-0 grid-cols-[repeat(3,minmax(0,1fr))] grid-rows-[repeat(2,minmax(0,1fr))] gap-3 md:grid">
          {Array.from({ length: TILE_COUNT }, (_, index) => {
            const photo = visiblePhotos[index + 1];
            const isLast = index === TILE_COUNT - 1;
            return (
              <button
                type="button"
                key={photo ?? `placeholder-${index}`}
                onClick={(event) => showPhoto(index + 1, event.currentTarget)}
                disabled={!photo}
                className="relative min-h-0 min-w-0 overflow-hidden bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                aria-label={
                  photo ? t('group.viewPhoto', { index: index + 2, title }) : t('group.noPhoto')
                }
              >
                {photo ? (
                  <Image
                    src={photo}
                    alt=""
                    width={430}
                    height={328}
                    className="block size-full object-cover object-top"
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
        mobileMediaLayout="full-bleed"
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
