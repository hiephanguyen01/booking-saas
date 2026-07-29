import type { CreateListingGroupInput, ListingGroupAmenity } from '@booking/contracts';
import { Controller, type UseFormReturn } from '@booking/ui/components/form/rhf';
import { Button } from '@booking/ui/components/ui/button';
import { Field, FieldDescription, FieldLabel } from '@booking/ui/components/ui/field';
import { Input } from '@booking/ui/components/ui/input';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { IconPicker } from '~/components/icon-picker';

export function ListingGroupAmenitiesField({
  form,
}: {
  form: UseFormReturn<CreateListingGroupInput>;
}) {
  return (
    <Controller
      control={form.control}
      name="amenities"
      render={({ field, fieldState }) => {
        const rows = field.value ?? [];
        const update = (index: number, patch: Partial<ListingGroupAmenity>) =>
          field.onChange(
            rows.map((row, current) => (current === index ? { ...row, ...patch } : row)),
          );
        const move = (index: number, direction: -1 | 1) => {
          const target = index + direction;
          if (target < 0 || target >= rows.length) return;
          const next = [...rows];
          [next[index], next[target]] = [next[target]!, next[index]!];
          field.onChange(next);
        };

        return (
          <Field>
            <FieldLabel>Tiện ích hoặc thông tin chung</FieldLabel>
            <FieldDescription>
              Mỗi dòng gồm một tên và biểu tượng; thứ tự này cũng là thứ tự hiển thị ngoài
              storefront.
            </FieldDescription>
            <div className="mt-3 space-y-3">
              {rows.map((amenity, index) => (
                <div
                  key={index}
                  className="grid gap-3 rounded-md border p-3 sm:grid-cols-[minmax(0,1fr)_minmax(13rem,auto)_auto]"
                >
                  <Input
                    value={amenity.label}
                    onBlur={field.onBlur}
                    onChange={(event) => update(index, { label: event.target.value })}
                    placeholder="Ví dụ: Wi-Fi tốc độ cao"
                    aria-label={`Tên tiện ích ${index + 1}`}
                  />
                  <IconPicker
                    value={amenity.icon}
                    onChange={(icon) => update(index, { icon: icon ?? 'Check' })}
                    ariaLabel={`Biểu tượng cho ${amenity.label || `tiện ích ${index + 1}`}`}
                    className="min-w-0"
                  />
                  <div className="flex justify-end gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                      aria-label={`Đưa tiện ích ${index + 1} lên`}
                    >
                      <ArrowUp className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={index === rows.length - 1}
                      onClick={() => move(index, 1)}
                      aria-label={`Đưa tiện ích ${index + 1} xuống`}
                    >
                      <ArrowDown className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => field.onChange(rows.filter((_, current) => current !== index))}
                      aria-label={`Xoá tiện ích ${index + 1}`}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            {fieldState.error?.message ? (
              <p className="text-xs text-destructive">{fieldState.error.message}</p>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => field.onChange([...rows, { label: '', icon: 'Check' }])}
              disabled={rows.length >= 24}
            >
              <Plus className="size-4" />
              Thêm tiện ích
            </Button>
          </Field>
        );
      }}
    />
  );
}
