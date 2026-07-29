import { useRef, useState } from 'react';

/**
 * Opening a media viewer from a list: which item is showing, at which photo, and
 * which button to hand focus back to when it closes.
 *
 * The package table and the room list wired this identically — the same state
 * shape, ref, lookup and five dialog props — so focus-return and index handling
 * had to be fixed in both. Callers keep only the parts that differ: the item
 * list, its identity, and what the dialog renders.
 */
export function useMediaGallery<T>(items: readonly T[], idOf: (item: T) => string) {
  const [active, setActive] = useState<{ id: string; index: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const item = active ? (items.find((candidate) => idOf(candidate) === active.id) ?? null) : null;

  function open(id: string, index: number, trigger: HTMLButtonElement): void {
    triggerRef.current = trigger;
    setActive({ id, index });
  }

  return {
    item,
    open,
    /** Spread onto `<PackageMediaViewerDialog>`; `items`/`title`/`details` stay with the caller. */
    dialogProps: {
      open: Boolean(item),
      activeIndex: active?.index ?? 0,
      returnFocusRef: triggerRef,
      onOpenChange: (nextOpen: boolean) => {
        if (!nextOpen) setActive(null);
      },
      onActiveIndexChange: (index: number) =>
        setActive((current) => (current ? { ...current, index } : current)),
    },
  };
}
