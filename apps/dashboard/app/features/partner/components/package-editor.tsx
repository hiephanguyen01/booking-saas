import { Plus, Trash2 } from 'lucide-react';
import {
  SortableCollection,
  SortableHandle,
  SortableItem,
} from '@booking/ui/components/form/sortable-collection';
import { Button } from '@booking/ui/components/ui/button';
import { Checkbox } from '@booking/ui/components/ui/checkbox';
import { ImageUpload } from '@booking/ui/components/form/image-upload';
import { Input } from '@booking/ui/components/ui/input';
import { Textarea } from '@booking/ui/components/ui/textarea';
import { Field } from '~/components/form-layout';
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
  const move = (fromIndex: number, toIndex: number): void => {
    const next = [...rows];
    const [row] = next.splice(fromIndex, 1);
    if (!row) return;
    next.splice(toIndex, 0, row);
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
      <SortableCollection onMove={move} announcementLabel="Gói dịch vụ">
        <div className="space-y-4">
          {rows.map((row, index) => (
            <SortableItem
              key={row.id}
              id={row.id}
              index={index}
              disabled={rows.length < 2}
            >
              {({ itemRef, handleRef, isDragging }) => (
                <div
                  ref={itemRef}
                  className={[
                    'space-y-3 rounded-lg border p-4 transition',
                    isDragging ? 'z-10 opacity-45 ring-2 ring-primary/40' : '',
                  ].join(' ')}
                >
                  <div className="flex items-center gap-2">
                    <SortableHandle
                      ref={handleRef}
                      label={`Kéo để sắp xếp gói ${row.name || index + 1}`}
                      disabled={rows.length < 2}
                      className="border bg-muted/30"
                    />
                    <label className="flex min-w-0 flex-1 items-center gap-2 text-sm">
                      <Checkbox
                        checked={row.isActive}
                        onCheckedChange={(checked) =>
                          update(index, { isActive: checked === true })
                        }
                      />
                      Đang cung cấp
                    </label>
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
                        update(index, {
                          photos: Array.isArray(photos) ? photos : [photos].filter(Boolean),
                        })
                      }
                      target="listings"
                      multiple
                      maxFiles={8}
                      reorderable
                      variant="compact-gallery"
                    />
                  </Field>
                </div>
              )}
            </SortableItem>
          ))}
        </div>
      </SortableCollection>
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
