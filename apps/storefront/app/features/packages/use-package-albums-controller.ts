import { useMemo, useRef, useState } from 'react';
import type { PublicPackageOption } from '../../lib/package-options';

type PackageAlbum = {
  id: string;
  name: string;
  photos: string[];
  item: PublicPackageOption | null;
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
    const items: PackageAlbum[] = packages
      .filter((item) => item.photos.length)
      .map((item) => ({ id: item.id, name: item.name, photos: item.photos, item }));

    if (!items.length && fallbackPhotos.length) {
      items.push({ id: 'listing', name: title, photos: fallbackPhotos, item: null });
    }

    return items;
  }, [fallbackPhotos, packages, title]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const active = albums.find((album) => album.id === activeId) ?? null;

  function openAlbum(albumId: string, trigger: HTMLButtonElement): void {
    triggerRef.current = trigger;
    setActiveIndex(0);
    setActiveId(albumId);
  }

  function handleOpenChange(open: boolean): void {
    if (!open) {
      setActiveId(null);
      setActiveIndex(0);
    }
  }

  return {
    active,
    activeIndex,
    albums,
    handleOpenChange,
    openAlbum,
    setActiveIndex,
    triggerRef,
  };
}
