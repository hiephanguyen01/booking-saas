'use client';

import * as React from 'react';
import { DragDropProvider, type DragEndEvent } from '@dnd-kit/react';
import { isSortable, useSortable } from '@dnd-kit/react/sortable';
import { GripVertical } from 'lucide-react';

import { cn } from '@booking/ui/lib/utils';

type SortableId = string | number;

export interface SortableCollectionProps {
  children: React.ReactNode;
  onMove: (fromIndex: number, toIndex: number) => void;
  announcementLabel?: string;
}

/**
 * An isolated sortable context. Nesting collections is supported: drag events
 * are handled by the nearest provider, so an image gallery inside a package
 * card cannot reorder the package itself.
 */
export function SortableCollection({
  children,
  onMove,
  announcementLabel = 'Mục',
}: SortableCollectionProps) {
  const [announcement, setAnnouncement] = React.useState('');

  const handleDragEnd = React.useCallback(
    (event: DragEndEvent) => {
      const { source, target } = event.operation;
      if (
        event.canceled ||
        !source ||
        !target ||
        !isSortable(source) ||
        !isSortable(target)
      )
        return;

      const fromIndex = source.initialIndex;
      const toIndex = source.index;
      if (fromIndex === toIndex) return;

      onMove(fromIndex, toIndex);
      setAnnouncement(`${announcementLabel} đã chuyển tới vị trí ${toIndex + 1}.`);
    },
    [announcementLabel, onMove],
  );

  return (
    <DragDropProvider onDragEnd={handleDragEnd}>
      {children}
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </span>
    </DragDropProvider>
  );
}

export interface SortableItemState {
  itemRef: (element: HTMLElement | null) => void;
  handleRef: (element: HTMLElement | null) => void;
  isDragging: boolean;
  isDropTarget: boolean;
}

export function SortableItem({
  id,
  index,
  disabled,
  children,
}: {
  id: SortableId;
  index: number;
  disabled?: boolean;
  children: (state: SortableItemState) => React.ReactNode;
}) {
  const sortable = useSortable({ id, index, disabled });

  return children({
    itemRef: (element) => sortable.ref(element),
    handleRef: (element) => sortable.handleRef(element),
    isDragging: sortable.isDragging,
    isDropTarget: sortable.isDropTarget,
  });
}

export const SortableHandle = React.forwardRef<
  HTMLButtonElement,
  {
    label: string;
    disabled?: boolean;
    className?: string;
  }
>(({ label, disabled, className }, ref) => (
  <button
    ref={ref}
    type="button"
    aria-label={label}
    title={label}
    disabled={disabled}
    className={cn(
      'grid size-11 shrink-0 touch-none place-items-center rounded-lg text-muted-foreground outline-none transition',
      'cursor-grab hover:bg-muted hover:text-foreground active:cursor-grabbing',
      'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
      'disabled:pointer-events-none disabled:cursor-default disabled:opacity-35',
      className,
    )}
  >
    <GripVertical className="size-4" aria-hidden />
  </button>
));
SortableHandle.displayName = 'SortableHandle';
