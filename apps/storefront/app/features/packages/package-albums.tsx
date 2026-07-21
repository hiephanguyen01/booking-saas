import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@booking/ui/components/ui/dialog';
import { ImageIcon } from 'lucide-react';
import { useRef, useState } from 'react';
import { SectionCard } from '../../components/section-card';
import { NsI18n, useTranslation } from '../../lib/i18n';
import type { PublicPackageOption } from '../../lib/package-options';

export function PackageAlbums({
  packages,
  fallbackPhotos,
  title,
}: {
  packages: PublicPackageOption[];
  fallbackPhotos: string[];
  title: string;
}) {
  const { t } = useTranslation(NsI18n.Listing);
  const albums = packages
    .filter((item) => item.photos.length)
    .map((item) => ({ id: item.id, name: item.name, photos: item.photos }));
  if (!albums.length && fallbackPhotos.length) {
    albums.push({ id: 'listing', name: title, photos: fallbackPhotos });
  }
  const [activeId, setActiveId] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const active = albums.find((album) => album.id === activeId) ?? null;

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
              onClick={(event) => {
                triggerRef.current = event.currentTarget;
                setActiveId(album.id);
              }}
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

      <Dialog open={Boolean(active)} onOpenChange={(open) => !open && setActiveId(null)}>
        <DialogContent
          className="max-h-[90vh] overflow-y-auto sm:max-w-4xl"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            triggerRef.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>{active?.name ?? title}</DialogTitle>
            <DialogDescription>
              {active ? t('group.photoCounter', { current: 1, total: active.photos.length }) : ''}
            </DialogDescription>
          </DialogHeader>
          {active?.photos.length ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {active.photos.map((photo, index) => (
                <img
                  key={`${photo}-${index}`}
                  src={photo}
                  alt={t('group.photoAlt', { title: active.name, index: index + 1 })}
                  className="aspect-4/3 w-full rounded-md object-cover"
                />
              ))}
            </div>
          ) : (
            <div className="grid h-64 place-items-center rounded-md bg-muted text-muted-foreground">
              <ImageIcon className="size-8" aria-hidden="true" />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
