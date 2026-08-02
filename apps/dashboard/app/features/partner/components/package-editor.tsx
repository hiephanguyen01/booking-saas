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

export interface PackageEditorRowError {
  name?: string;
  duration?: string;
  price?: string;
}

export function PackageEditor({
  rows,
  durationLabel,
  durationStep = 1,
  onChange,
  errors = [],
}: {
  rows: PackageRow[];
  durationLabel: string;
  durationStep?: number;
  onChange: (rows: PackageRow[]) => void;
  errors?: PackageEditorRowError[];
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
          {rows.length === 0 ? (
            <div className="rounded-xl border border-dashed bg-muted/20 px-5 py-6 text-center">
              <p className="text-sm font-medium">Chưa có gói dịch vụ</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Mỗi gói cần có tên, thời lượng và giá lớn hơn 0 để sẵn sàng gửi duyệt.
              </p>
            </div>
          ) : null}
          {rows.map((row, index) => (
            <SortableItem key={row.id} id={row.id} index={index} disabled={rows.length < 2}>
              {({ itemRef, handleRef, isDragging }) => (
                <PackageEditorCard
                  itemRef={itemRef}
                  handleRef={handleRef}
                  isDragging={isDragging}
                  row={row}
                  index={index}
                  rowsLength={rows.length}
                  durationLabel={durationLabel}
                  durationStep={durationStep}
                  errors={errors[index]}
                  update={update}
                  remove={remove}
                />
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

function PackageEditorCard({
  itemRef,
  handleRef,
  isDragging,
  row,
  index,
  rowsLength,
  durationLabel,
  durationStep,
  errors,
  update,
  remove,
}: {
  itemRef: (element: HTMLElement | null) => void;
  handleRef: (element: HTMLElement | null) => void;
  isDragging: boolean;
  row: PackageRow;
  index: number;
  rowsLength: number;
  durationLabel: string;
  durationStep: number;
  errors?: PackageEditorRowError;
  update: (index: number, patch: Partial<PackageRow>) => void;
  remove: (index: number) => void;
}) {
  const prefix = `listing-package-${row.id}`;
  const nameError = errors?.name ?? (!row.name.trim() ? 'Vui lòng nhập tên gói' : undefined);
  const durationError =
    errors?.duration ?? (Number(row.duration) <= 0 ? 'Thời lượng gói phải lớn hơn 0' : undefined);
  const validPrice = /^\d+$/.test(row.price) && BigInt(row.price) > 0n;
  const priceError = errors?.price ?? (!validPrice ? 'Giá gói phải lớn hơn 0' : undefined);
  const invalid = Boolean(nameError || durationError || priceError);

  return (
    <div
      ref={itemRef}
      className={[
        'space-y-3 rounded-lg border p-4 transition',
        invalid ? 'border-destructive/40' : '',
        isDragging ? 'z-10 opacity-45 ring-2 ring-primary/40' : '',
      ].join(' ')}
    >
      <div className="flex items-center gap-2">
        <SortableHandle
          ref={handleRef}
          label={`Kéo để sắp xếp gói ${row.name || index + 1}`}
          disabled={rowsLength < 2}
          className="border bg-muted/30"
        />
        <label className="flex min-w-0 flex-1 items-center gap-2 text-sm">
          <Checkbox
            checked={row.isActive}
            onCheckedChange={(checked) => update(index, { isActive: checked === true })}
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
      {invalid ? (
        <p className="text-xs text-destructive">
          Hoàn tất tên, thời lượng và giá của gói hoặc xóa gói trước khi lưu.
        </p>
      ) : null}
      <div className="grid gap-3 md:grid-cols-2">
        <Field
          label="Tên gói *"
          htmlFor={`${prefix}-name`}
          error={nameError ? [nameError] : undefined}
          errorId={`${prefix}-name-error`}
        >
          <Input
            id={`${prefix}-name`}
            value={row.name}
            onChange={(event) => update(index, { name: event.target.value })}
            aria-invalid={Boolean(nameError)}
            aria-describedby={nameError ? `${prefix}-name-error` : undefined}
          />
        </Field>
        <Field
          label={`${durationLabel} *`}
          htmlFor={`${prefix}-duration`}
          error={durationError ? [durationError] : undefined}
          errorId={`${prefix}-duration-error`}
        >
          <Input
            id={`${prefix}-duration`}
            type="number"
            min={durationStep}
            step={durationStep}
            value={row.duration}
            onChange={(event) => update(index, { duration: event.target.value })}
            aria-invalid={Boolean(durationError)}
            aria-describedby={durationError ? `${prefix}-duration-error` : undefined}
          />
        </Field>
        <Field
          label="Giá gói (VND) *"
          htmlFor={`${prefix}-price`}
          error={priceError ? [priceError] : undefined}
          errorId={`${prefix}-price-error`}
        >
          <Input
            id={`${prefix}-price`}
            type="number"
            min={1}
            value={row.price}
            onChange={(event) => update(index, { price: event.target.value })}
            aria-invalid={Boolean(priceError)}
            aria-describedby={priceError ? `${prefix}-price-error` : undefined}
          />
        </Field>
        <Field label="Mô tả (tuỳ chọn)" htmlFor={`${prefix}-description`}>
          <Textarea
            id={`${prefix}-description`}
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
  );
}
