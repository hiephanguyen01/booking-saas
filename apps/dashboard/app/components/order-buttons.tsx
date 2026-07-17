import { ArrowDown, ArrowUp } from 'lucide-react';
import { Button } from '@booking/ui/components/ui/button';

/** Swap `items[index]` with its neighbour; returns the input unchanged at the edges. */
export function move<T>(items: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (target < 0 || target >= items.length) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
}

/**
 * The ↑/↓ reorder pair for a row in an orderable list. `label` feeds the
 * accessible names ("Đưa X lên/xuống"); the ends disable automatically.
 */
export function OrderButtons({
  label,
  index,
  length,
  onMove,
}: {
  label: string;
  index: number;
  length: number;
  onMove: (direction: -1 | 1) => void;
}) {
  return (
    <div className="flex shrink-0 gap-1">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        disabled={index === 0}
        onClick={() => onMove(-1)}
        aria-label={`Đưa ${label} lên`}
      >
        <ArrowUp className="size-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        disabled={index === length - 1}
        onClick={() => onMove(1)}
        aria-label={`Đưa ${label} xuống`}
      >
        <ArrowDown className="size-4" />
      </Button>
    </div>
  );
}
