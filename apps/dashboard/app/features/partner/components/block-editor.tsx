import { Plus, X } from 'lucide-react';
import { Button } from '@booking/ui/components/ui/button';
import { Input } from '@booking/ui/components/ui/input';
import { Field } from './form-layout';
import type { BlockRow } from '../lib/listing-mode-config';

/**
 * Bundle pricing (§9.1): "N hours/nights for a flat price". A booking whose
 * duration matches a block is charged the block price and pricing rules never
 * override it — so these rows are real money, and losing them (as this form used
 * to, by hardcoding `blocks: []`) silently re-prices the listing.
 */
export function BlockEditor({
  rows,
  unitLabel,
  onChange,
}: {
  rows: BlockRow[];
  unitLabel: string;
  onChange: (rows: BlockRow[]) => void;
}) {
  const update = (i: number, patch: Partial<BlockRow>): void =>
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-medium">Giá theo gói</h3>
        <p className="text-xs text-muted-foreground">
          Đặt đúng số {unitLabel} của gói sẽ được tính giá trọn gói thay vì giá lẻ.
        </p>
      </div>
      {rows.length > 0 ? (
        <div className="space-y-2">
          {rows.map((row, i) => (
            <div key={i} className="flex items-end gap-2">
              <div className="flex-1">
                <Field label={`Số ${unitLabel}`}>
                  <Input
                    type="number"
                    min={1}
                    value={row.count}
                    onChange={(e) => update(i, { count: e.target.value })}
                  />
                </Field>
              </div>
              <div className="flex-1">
                <Field label="Giá trọn gói (VND)">
                  <Input
                    type="number"
                    min={0}
                    value={row.price}
                    onChange={(e) => update(i, { price: e.target.value })}
                  />
                </Field>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="mb-0.5"
                onClick={() => onChange(rows.filter((_, idx) => idx !== i))}
                aria-label={`Xoá gói ${i + 1}`}
              >
                <X className="size-4" aria-hidden />
              </Button>
            </div>
          ))}
        </div>
      ) : null}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onChange([...rows, { count: '', price: '' }])}
      >
        <Plus className="size-4" aria-hidden /> Thêm gói
      </Button>
    </div>
  );
}
