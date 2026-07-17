import type { ListingTypeSearchBucket } from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import { Input } from '@booking/ui/components/ui/input';
import { Plus, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { move, OrderButtons } from '~/components/order-buttons';

/** A fresh bucket with a unique `khoang-n` id among `existing`. */
export function newBucket(existing: ListingTypeSearchBucket[]): ListingTypeSearchBucket {
  const ids = new Set(existing.map((bucket) => bucket.id));
  let index = existing.length + 1;
  while (ids.has(`khoang-${index}`)) index += 1;
  return { id: `khoang-${index}`, label: `Khoảng ${index}`, min: 0 };
}

/** Row editor for a `buckets` facet's predefined numeric ranges (min inclusive, max exclusive). */
export function NumericBucketEditor({
  buckets,
  onChange,
}: {
  buckets: ListingTypeSearchBucket[];
  onChange: (buckets: ListingTypeSearchBucket[]) => void;
}) {
  const nextRowId = useRef(buckets.length);
  const [rowIds, setRowIds] = useState(() =>
    buckets.map((_, index) => `bucket-editor-row-${index}`),
  );
  const update = (index: number, patch: Partial<ListingTypeSearchBucket>): void =>
    onChange(
      buckets.map((bucket, current) => (current === index ? { ...bucket, ...patch } : bucket)),
    );
  const add = (): void => {
    const rowId = `bucket-editor-row-${nextRowId.current}`;
    nextRowId.current += 1;
    setRowIds((current) => [...current, rowId]);
    onChange([...buckets, newBucket(buckets)]);
  };
  const remove = (index: number): void => {
    setRowIds((current) => current.filter((_, currentIndex) => currentIndex !== index));
    onChange(buckets.filter((_, current) => current !== index));
  };
  const moveBucket = (index: number, direction: -1 | 1): void => {
    setRowIds((current) => move(current, index, direction));
    onChange(move(buckets, index, direction));
  };

  return (
    <div className="space-y-3 border-t pt-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Các khoảng giá trị</p>
          <p className="text-xs text-muted-foreground">Min có tính, max không tính.</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={add}>
          <Plus className="size-3.5" /> Thêm khoảng
        </Button>
      </div>
      <div className="space-y-2">
        {buckets.map((bucket, index) => (
          <div
            key={rowIds[index]}
            className="grid gap-2 rounded-md bg-muted/40 p-3 sm:grid-cols-[1fr_1.4fr_0.8fr_0.8fr_auto]"
          >
            <Input
              value={bucket.id}
              onChange={(event) => update(index, { id: event.target.value })}
              placeholder="duoi-25"
              aria-label={`ID khoảng ${index + 1}`}
            />
            <Input
              value={bucket.label}
              onChange={(event) => update(index, { label: event.target.value })}
              placeholder="Dưới 25 m²"
              aria-label={`Nhãn khoảng ${index + 1}`}
            />
            <Input
              type="number"
              min={0}
              value={bucket.min ?? ''}
              onChange={(event) => update(index, { min: optionalNumber(event.target.value) })}
              placeholder="Min"
              aria-label={`Giá trị nhỏ nhất khoảng ${index + 1}`}
            />
            <Input
              type="number"
              min={0}
              value={bucket.max ?? ''}
              onChange={(event) => update(index, { max: optionalNumber(event.target.value) })}
              placeholder="Max"
              aria-label={`Giá trị lớn nhất khoảng ${index + 1}`}
            />
            <div className="flex items-center justify-end gap-1">
              <OrderButtons
                label={`Khoảng ${bucket.label || index + 1}`}
                index={index}
                length={buckets.length}
                onMove={(direction) => moveBucket(index, direction)}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => remove(index)}
                aria-label={`Xoá khoảng ${index + 1}`}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function optionalNumber(value: string): number | undefined {
  if (value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
