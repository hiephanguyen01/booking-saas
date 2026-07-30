import type { CreateListingGroupInput } from '@booking/contracts';
import { Controller, useFieldArray, type UseFormReturn } from '@booking/ui/components/form/rhf';
import {
  SortableCollection,
  SortableHandle,
  SortableItem,
} from '@booking/ui/components/form/sortable-collection';
import { Button } from '@booking/ui/components/ui/button';
import { Input } from '@booking/ui/components/ui/input';
import { CirclePlus, Sparkles } from 'lucide-react';
import { IconPicker } from '~/components/icon-picker';

/**
 * The listing group's shared amenities. Rows mirror the sortable list attribute
 * of the listing form (`attribute-input.tsx`) — same geometry, same dnd-kit
 * primitive — so both forms reorder the same way. Order is the array order.
 */
export function ListingGroupAmenitiesField({
  form,
}: {
  form: UseFormReturn<CreateListingGroupInput>;
}) {
  const { fields, append, remove, move } = useFieldArray({
    control: form.control,
    name: 'amenities',
  });
  const sortingDisabled = fields.length < 2;

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
        <SortableCollection onMove={move} announcementLabel="Tiện ích">
          <div className="space-y-2">
            {fields.map((amenity, index) => (
              <SortableItem
                key={amenity.id}
                id={amenity.id}
                index={index}
                disabled={sortingDisabled}
              >
                {({ itemRef, handleRef, isDragging }) => (
                  <div
                    ref={itemRef}
                    className={[
                      'grid min-w-0 grid-cols-[2rem_2.75rem_auto_minmax(0,1fr)_auto] items-center gap-2 rounded-xl transition',
                      isDragging ? 'z-10 opacity-45 ring-2 ring-primary/40' : '',
                    ].join(' ')}
                  >
                    <span className="text-center text-sm tabular-nums text-muted-foreground">
                      #{index + 1}
                    </span>
                    <SortableHandle
                      ref={handleRef}
                      label={`Kéo để sắp xếp tiện ích ${index + 1}`}
                      disabled={sortingDisabled}
                      className="border bg-muted/30"
                    />
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
                            className="min-w-0 rounded-xl"
                          />
                          {fieldState.error?.message ? (
                            <p className="mt-1 text-xs text-destructive">
                              {fieldState.error.message}
                            </p>
                          ) : null}
                        </div>
                      )}
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      size="control"
                      onClick={() => remove(index)}
                      aria-label={`Xóa tiện ích ${index + 1}`}
                      className="rounded-xl px-4"
                    >
                      Xóa
                    </Button>
                  </div>
                )}
              </SortableItem>
            ))}
          </div>
        </SortableCollection>
      )}

      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => append({ label: '', icon: 'Check' }, { shouldFocus: true })}
        disabled={fields.length >= 24}
        className="px-1"
      >
        <CirclePlus className="size-4" />
        Thêm tiện ích
      </Button>
      {fields.length >= 24 ? (
        <p className="text-xs text-muted-foreground">Đã đạt tối đa 24 tiện ích.</p>
      ) : null}
    </div>
  );
}
