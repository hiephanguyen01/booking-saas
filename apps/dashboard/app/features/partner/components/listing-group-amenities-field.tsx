import type { CreateListingGroupInput } from '@booking/contracts';
import { Controller, useFieldArray, type UseFormReturn } from '@booking/ui/components/form/rhf';
import { Button } from '@booking/ui/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@booking/ui/components/ui/dropdown-menu';
import { Input } from '@booking/ui/components/ui/input';
import { ArrowDown, ArrowUp, MoreHorizontal, Plus, Sparkles, Trash2 } from 'lucide-react';
import { IconPicker } from '~/components/icon-picker';

export function ListingGroupAmenitiesField({
  form,
}: {
  form: UseFormReturn<CreateListingGroupInput>;
}) {
  const { fields, append, remove, move } = useFieldArray({
    control: form.control,
    name: 'amenities',
  });

  return (
    <div className="space-y-3">
      {fields.length === 0 ? (
        <div className="flex items-center gap-3 rounded-lg border border-dashed px-4 py-5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted">
            <Sparkles className="size-4 text-muted-foreground" />
          </span>
          <div>
            <p className="text-sm font-medium">Chưa có tiện ích chung</p>
            <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
              Ví dụ: Wi-Fi, bãi đỗ xe hoặc phòng thay đồ.
            </p>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          {fields.map((amenity, index) => (
            <div
              key={amenity.id}
              className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-2 border-b p-2.5 last:border-b-0"
            >
              <Controller
                control={form.control}
                name={`amenities.${index}.icon`}
                render={({ field }) => (
                  <IconPicker
                    value={field.value}
                    onChange={(icon) => field.onChange(icon ?? 'Check')}
                    ariaLabel={`Chọn biểu tượng cho tiện ích ${index + 1}`}
                    compact
                    clearable={false}
                  />
                )}
              />
              <Controller
                control={form.control}
                name={`amenities.${index}.label`}
                render={({ field, fieldState }) => (
                  <div className="min-w-0">
                    <Input
                      {...field}
                      placeholder="Ví dụ: Wi-Fi tốc độ cao"
                      aria-label={`Tên tiện ích ${index + 1}`}
                      aria-invalid={fieldState.invalid}
                      className="border-0 bg-transparent shadow-none focus-visible:ring-1"
                    />
                    {fieldState.error?.message ? (
                      <p className="mt-1 text-xs text-destructive">{fieldState.error.message}</p>
                    ) : null}
                  </div>
                )}
              />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Tùy chọn tiện ích ${index + 1}`}
                  >
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem disabled={index === 0} onSelect={() => move(index, index - 1)}>
                    <ArrowUp />
                    Đưa lên trên
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={index === fields.length - 1}
                    onSelect={() => move(index, index + 1)}
                  >
                    <ArrowDown />
                    Đưa xuống dưới
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onSelect={() => remove(index)}>
                    <Trash2 />
                    Xóa tiện ích
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
        </div>
      )}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => append({ label: '', icon: 'Check' }, { shouldFocus: true })}
        disabled={fields.length >= 24}
      >
        <Plus className="size-4" />
        Thêm tiện ích
      </Button>
      {fields.length >= 24 ? (
        <p className="text-xs text-muted-foreground">Đã đạt tối đa 24 tiện ích.</p>
      ) : null}
    </div>
  );
}
