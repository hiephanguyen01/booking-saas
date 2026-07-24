import { useState } from 'react';

const VISIBLE_PHOTO_COUNT = 7;

export function useStudioGalleryController(photos: string[]) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const visiblePhotos = photos.slice(0, VISIBLE_PHOTO_COUNT);
  const overflowCount = Math.max(0, photos.length - VISIBLE_PHOTO_COUNT);
  const activePhoto = photos[activeIndex];

  function showPhoto(index: number): void {
    if (!photos[index]) return;

    setActiveIndex(index);
    setOpen(true);
  }

  return {
    activeIndex,
    activePhoto,
    open,
    overflowCount,
    setActiveIndex,
    setOpen,
    showPhoto,
    visiblePhotos,
  };
}
