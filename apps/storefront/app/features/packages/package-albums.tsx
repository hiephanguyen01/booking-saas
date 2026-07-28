import type { PublicListingDetailResponse } from '@booking/contracts';
import {
  MediaViewerDialog,
  type MediaViewerItem,
} from '@booking/ui/components/media/media-viewer-dialog';
import { PackageMediaViewerDialog } from '@booking/ui/components/media/package-media-viewer-dialog';
import { SectionCard } from '~/components/section-card';
import { NsI18n, useTranslation } from '~/lib/i18n';
import type { PublicPackageOption } from '~/lib/package-options';
import { useMediaViewerLabels } from '~/hooks/use-media-viewer-labels';
import { PackageMediaDetails } from './package-media-details';
import { usePackageAlbumsController } from './use-package-albums-controller';

export function PackageAlbums({
  packages,
  fallbackPhotos,
  title,
  listing,
}: {
  packages: PublicPackageOption[];
  fallbackPhotos: string[];
  title: string;
  listing: PublicListingDetailResponse;
}) {
  const { t } = useTranslation(NsI18n.Listing);
  const viewerLabels = useMediaViewerLabels();
  const { active, activeIndex, albums, handleOpenChange, openAlbum, setActiveIndex, triggerRef } =
    usePackageAlbumsController({ packages, fallbackPhotos, title });
  const mediaItems: MediaViewerItem[] =
    active?.photos.map((photo, index) => ({
      kind: 'image',
      url: photo,
      alt: t('group.photoAlt', { title: active.name, index: index + 1 }),
    })) ?? [];

  if (!albums.length) return null;

  return (
    <>
      <SectionCard aria-labelledby="packages-albums-title">
        <h2 id="packages-albums-title" className="text-base font-semibold">
          {t('packages.albums')}
        </h2>
        <div className="mt-4 flex gap-3 overflow-x-auto pb-1">
          {albums.map((album) => (
            <button
              key={album.id}
              type="button"
              onClick={(event) => openAlbum(album.id, event.currentTarget)}
              className="group relative h-20 w-28 shrink-0 overflow-hidden rounded-md bg-muted text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={t('packages.viewAlbum', { name: album.name })}
            >
              <img
                src={album.photos[0]}
                alt=""
                className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
              <span className="absolute inset-0 bg-gradient-to-t from-foreground/80 via-foreground/10 to-transparent" />
              <span className="absolute inset-x-2 bottom-2 truncate text-xs font-semibold text-background">
                {album.name}
              </span>
            </button>
          ))}
        </div>
      </SectionCard>

      {active?.item ? (
        <PackageMediaViewerDialog
          open={Boolean(active)}
          items={mediaItems}
          activeIndex={activeIndex}
          onOpenChange={handleOpenChange}
          onActiveIndexChange={setActiveIndex}
          labels={viewerLabels}
          title={active.name}
          description={t('packages.mediaViewerDescription', { name: active.name })}
          returnFocusRef={triggerRef}
          details={<PackageMediaDetails item={active.item} listing={listing} />}
        />
      ) : (
        <MediaViewerDialog
          open={Boolean(active)}
          items={mediaItems}
          activeIndex={activeIndex}
          onOpenChange={handleOpenChange}
          onActiveIndexChange={setActiveIndex}
          labels={viewerLabels}
          title={active?.name ?? title}
          description={t('packages.mediaViewerDescription', {
            name: active?.name ?? title,
          })}
          returnFocusRef={triggerRef}
        />
      )}
    </>
  );
}
