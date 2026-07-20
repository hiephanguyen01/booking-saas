import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { Button } from '@booking/ui/components/ui/button';
import { Checkbox } from '@booking/ui/components/ui/checkbox';
import { ImageUpload } from '@booking/ui/components/form/image-upload';
import { Input } from '@booking/ui/components/ui/input';
import { Textarea } from '@booking/ui/components/ui/textarea';
import { Field } from './form-layout';
import type { PackageRow } from '../lib/listing-mode-config';

function newPackage(sortOrder: number): PackageRow {
  return {
    id: crypto.randomUUID(),
    name: '',
    description: '',
    photos: [],
    duration: '',
    price: '',
    isActive: true,
    sortOrder,
    persisted: false,
  };
}

export function PackageEditor({
  rows,
  durationLabel,
  durationStep = 1,
  onChange,
}: {
  rows: PackageRow[];
  durationLabel: string;
  durationStep?: number;
  onChange: (rows: PackageRow[]) => void;
}) {
  const update = (index: number, patch: Partial<PackageRow>): void =>
    onChange(rows.map((row, current) => (current === index ? { ...row, ...patch } : row)));
  const move = (index: number, direction: -1 | 1): void => {
    const target = index + direction;
    if (target < 0 || target >= rows.length) return;
    const next = [...rows];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };
  const remove = (index: number): void => {
    const row = rows[index];
    onChange(
      row.persisted
        ? rows.map((item, current) => (current === index ? { ...item, isActive: false } : item))
        : rows.filter((_, current) => current !== index),
    );
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium">Các gói dịch vụ</h3>
        <p className="text-xs text-muted-foreground">
          Khách phải chọn một gói; giá và thời lượng booking lấy trực tiếp từ gói đó.
        </p>
      </div>
      {rows.map((row, index) => (
        <div key={row.id} className="space-y-3 rounded-lg border p-4">
          <div className="flex items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={row.isActive}
                onCheckedChange={(checked) => update(index, { isActive: checked === true })}
              />
              Đang cung cấp
            </label>
            <div className="flex gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => move(index, -1)}
                disabled={index === 0}
                aria-label="Đưa gói lên"
              >
                <ArrowUp className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => move(index, 1)}
                disabled={index === rows.length - 1}
                aria-label="Đưa gói xuống"
              >
                <ArrowDown className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => remove(index)}
                aria-label={row.persisted ? 'Ngừng cung cấp gói' : 'Xoá gói'}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Tên gói">
              <Input
                value={row.name}
                onChange={(event) => update(index, { name: event.target.value })}
              />
            </Field>
            <Field label={durationLabel}>
              <Input
                type="number"
                min={durationStep}
                step={durationStep}
                value={row.duration}
                onChange={(event) => update(index, { duration: event.target.value })}
              />
            </Field>
            <Field label="Giá gói (VND)">
              <Input
                type="number"
                min={1}
                value={row.price}
                onChange={(event) => update(index, { price: event.target.value })}
              />
            </Field>
            <Field label="Mô tả (tuỳ chọn)">
              <Textarea
                value={row.description}
                onChange={(event) => update(index, { description: event.target.value })}
              />
            </Field>
          </div>
          <Field label="Hình ảnh gói">
            <ImageUpload
              value={row.photos}
              onChange={(photos) =>
                update(index, { photos: Array.isArray(photos) ? photos : [photos].filter(Boolean) })
              }
              target="listings"
              multiple
              maxFiles={8}
              reorderable
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Tối đa 8 ảnh. Ảnh đầu tiên là ảnh đại diện; nếu để trống sẽ dùng ảnh của listing.
            </p>
          </Field>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onChange([...rows, newPackage(rows.length)])}
      >
        <Plus className="size-4" /> Thêm gói
      </Button>
    </div>
  );
}
