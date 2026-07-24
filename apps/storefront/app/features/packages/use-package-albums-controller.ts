import { useMemo, useRef, useState } from 'react';
import type { PublicPackageOption } from '../../lib/package-options';

type PackageAlbum = {
  id: string;
  name: string;
  photos: string[];
};

export function usePackageAlbumsController({
  packages,
  fallbackPhotos,
  title,
}: {
  packages: PublicPackageOption[];
  fallbackPhotos: string[];
  title: string;
}) {
  const albums = useMemo<PackageAlbum[]>(() => {
    const items = packages
      .filter((item) => item.photos.length)
      .map((item) => ({ id: item.id, name: item.name, photos: item.photos }));

    if (!items.length && fallbackPhotos.length) {
      items.push({ id: 'listing', name: title, photos: fallbackPhotos });
    }

    return items;
  }, [fallbackPhotos, packages, title]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const active = albums.find((album) => album.id === activeId) ?? null;

  function openAlbum(albumId: string, trigger: HTMLButtonElement): void {
    triggerRef.current = trigger;
    setActiveId(albumId);
  }

  function handleOpenChange(open: boolean): void {
    if (!open) setActiveId(null);
  }

  function restoreTriggerFocus(event: Event): void {
    event.preventDefault();
    triggerRef.current?.focus();
  }

  return {
    active,
    albums,
    handleOpenChange,
    openAlbum,
    restoreTriggerFocus,
  };
}
