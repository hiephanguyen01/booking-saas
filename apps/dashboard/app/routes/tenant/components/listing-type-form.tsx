import { Plus, X } from 'lucide-react';
import {
  createListingTypeInputSchema,
  type AttributeField,
  type AttributeFieldType,
  type BookingMode,
  type CreateListingTypeInput,
  type ListingTypeResponse,
} from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import { Checkbox } from '@booking/ui/components/ui/checkbox';
import { Input } from '@booking/ui/components/ui/input';
import { Label } from '@booking/ui/components/ui/label';
import { GenericForm } from '@booking/ui/components/form/generic-form';
import { Controller, type UseFormReturn } from '@booking/ui/components/form/rhf';
import { FAVICON_ACCEPT } from '@booking/ui/components/form/image-upload';
import type { FieldConfig } from '@booking/ui/components/form/types';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@booking/ui/components/ui/select';

const ALL_MODES: BookingMode[] = ['hourly', 'daily', 'inventory', 'appointment', 'class'];
const MODE_LABEL: Record<BookingMode, string> = {
  hourly: 'Theo giờ',
  daily: 'Theo ngày',
  inventory: 'Theo kho',
  appointment: 'Lịch hẹn',
  class: 'Lớp học',
};
const FIELD_TYPES: { value: AttributeFieldType; label: string }[] = [
  { value: 'text', label: 'Văn bản' },
  { value: 'number', label: 'Số' },
  { value: 'select', label: 'Chọn một' },
  { value: 'multiselect', label: 'Chọn nhiều' },
  { value: 'boolean', label: 'Có/Không' },
];

const isChoice = (type: AttributeFieldType): boolean =>
  type === 'select' || type === 'multiselect';

/** The scalar block — everything the field config can express. */
const fields: FieldConfig<CreateListingTypeInput>[] = [
  { name: 'name', type: 'text', label: 'Tên loại', placeholder: 'VD: Studio', colSpan: 1 },
  { name: 'slug', type: 'text', label: 'Slug', placeholder: 'studio', colSpan: 1 },
  {
    name: 'icon',
    type: 'file',
    label: 'Biểu tượng (tuỳ chọn)',
    target: 'tenants',
    accept: FAVICON_ACCEPT,
    maxSizeMb: 2,
    colSpan: 1,
  },
  { name: 'unitLabel', type: 'text', label: 'Đơn vị giá (tuỳ chọn)', placeholder: 'giờ', colSpan: 1 },
  { name: 'sortOrder', type: 'number', label: 'Thứ tự hiển thị', colSpan: 1 },
  { name: 'isActive', type: 'switch', label: 'Đang hoạt động', colSpan: 1 },
  {
    name: 'requiresIdentityVerification',
    type: 'switch',
    label: 'Yêu cầu xác minh danh tính',
    colSpan: 1,
  },
];

function defaultValues(t?: ListingTypeResponse): CreateListingTypeInput {
  return {
    name: t?.name ?? '',
    slug: t?.slug ?? '',
    icon: t?.icon ?? '',
    unitLabel: t?.unitLabel ?? '',
    allowedModes: t?.allowedModes ?? ['hourly'],
    defaultModes: t?.defaultModes ?? [],
    sortOrder: t?.sortOrder ?? 0,
    isActive: t?.isActive ?? true,
    requiresIdentityVerification: t?.requiresIdentityVerification ?? false,
    attributeSchema: t?.attributeSchema ?? [],
  };
}

export function ListingTypeForm({
  listingType,
  serverError,
  fieldErrors,
}: {
  listingType?: ListingTypeResponse;
  serverError?: string | null;
  fieldErrors?: Record<string, string[]> | null;
}) {
  const isEdit = Boolean(listingType);

  return (
    <GenericForm
      schema={createListingTypeInputSchema}
      fields={fields}
      columns={2}
      defaultValues={defaultValues(listingType)}
      submitLabel={isEdit ? 'Lưu thay đổi' : 'Tạo loại dịch vụ'}
      serverError={serverError}
      fieldErrors={fieldErrors}
      extraFields={(form) => <ModesAndAttributes form={form} />}
      transform={(d) => ({
        name: d.name.trim(),
        slug: d.slug.trim(),
        icon: d.icon?.trim() || undefined,
        unitLabel: d.unitLabel?.trim() || undefined,
        allowedModes: d.allowedModes,
        defaultModes: d.defaultModes,
        sortOrder: Math.max(0, Math.round(Number(d.sortOrder) || 0)),
        isActive: d.isActive,
        requiresIdentityVerification: d.requiresIdentityVerification,
        // Drop `options` for non-choice types so it doesn't linger on the payload.
        attributeSchema: d.attributeSchema.map((a) =>
          isChoice(a.type) ? a : { ...a, options: undefined },
        ),
      })}
    />
  );
}

/**
 * The dynamic block — booking modes and the custom attribute schema. Bound to the
 * same react-hook-form instance via `Controller`, so the shared zod schema
 * validates it and its values ride along in the submitted payload.
 */
function ModesAndAttributes({ form }: { form: UseFormReturn<CreateListingTypeInput> }) {
  const errors = form.formState.errors;

  return (
    <div className="space-y-6">
      <Controller
        control={form.control}
        name="allowedModes"
        render={({ field }) => {
          const allowed = field.value ?? [];
          const toggle = (mode: BookingMode, on: boolean): void => {
            const next = on ? [...allowed, mode] : allowed.filter((m) => m !== mode);
            field.onChange(next);
            // Keep defaultModes a subset of allowedModes.
            if (!on) {
              const dm = form.getValues('defaultModes') ?? [];
              form.setValue(
                'defaultModes',
                dm.filter((m) => m !== mode),
              );
            }
          };
          return (
            <section className="space-y-3 rounded-lg border p-4">
              <h2 className="text-sm font-semibold">Hình thức đặt cho phép</h2>
              <div className="flex flex-wrap gap-4">
                {ALL_MODES.map((m) => (
                  <label key={m} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={allowed.includes(m)}
                      onCheckedChange={(v) => toggle(m, v === true)}
                    />
                    {MODE_LABEL[m]}
                  </label>
                ))}
              </div>
              {errors.allowedModes ? (
                <p className="text-xs text-destructive">{String(errors.allowedModes.message)}</p>
              ) : null}

              <p className="pt-2 text-xs font-medium text-muted-foreground">
                Bật sẵn khi tạo listing:
              </p>
              <Controller
                control={form.control}
                name="defaultModes"
                render={({ field: dmField }) => {
                  const defaults = dmField.value ?? [];
                  return (
                    <div className="flex flex-wrap gap-4">
                      {allowed.map((m) => (
                        <label key={m} className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={defaults.includes(m)}
                            onCheckedChange={(v) =>
                              dmField.onChange(
                                v === true ? [...defaults, m] : defaults.filter((x) => x !== m),
                              )
                            }
                          />
                          {MODE_LABEL[m]}
                        </label>
                      ))}
                    </div>
                  );
                }}
              />
            </section>
          );
        }}
      />

      <Controller
        control={form.control}
        name="attributeSchema"
        render={({ field }) => {
          const rows: AttributeField[] = field.value ?? [];
          const update = (i: number, patch: Partial<AttributeField>): void =>
            field.onChange(rows.map((a, idx) => (idx === i ? { ...a, ...patch } : a)));
          const remove = (i: number): void => field.onChange(rows.filter((_, idx) => idx !== i));
          const add = (): void =>
            field.onChange([
              ...rows,
              { key: '', label: '', type: 'text', required: false, filterable: false },
            ]);

          return (
            <section className="space-y-3 rounded-lg border p-4">
              <h2 className="text-sm font-semibold">Thuộc tính tuỳ biến</h2>
              <p className="text-xs text-muted-foreground">
                Các trường sẽ hiện khi đối tác tạo listing thuộc loại này. Trường “lọc được” trở thành
                bộ lọc trên storefront.
              </p>
              {errors.attributeSchema && 'message' in errors.attributeSchema ? (
                <p className="text-xs text-destructive">
                  {String(errors.attributeSchema.message)}
                </p>
              ) : null}
              <div className="space-y-3">
                {rows.map((a, i) => (
                  <div key={i} className="space-y-3 rounded-md border p-3">
                    <div className="flex items-start gap-2">
                      <div className="grid flex-1 gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label>Khoá (key)</Label>
                          <Input
                            value={a.key}
                            onChange={(e) => update(i, { key: e.target.value })}
                            placeholder="area"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Nhãn</Label>
                          <Input
                            value={a.label}
                            onChange={(e) => update(i, { label: e.target.value })}
                            placeholder="Diện tích"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Kiểu</Label>
                          <Select
                            value={a.type}
                            onValueChange={(v) =>
                              update(i, {
                                type: v as AttributeFieldType,
                                // Reset options when leaving a choice type.
                                ...(isChoice(v as AttributeFieldType) ? {} : { options: undefined }),
                              })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {FIELD_TYPES.map((t) => (
                                <SelectItem key={t.value} value={t.value}>
                                  {t.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        {isChoice(a.type) ? (
                          <div className="space-y-1.5">
                            <Label>Tuỳ chọn (phân tách bằng dấu phẩy)</Label>
                            <Input
                              value={(a.options ?? []).join(', ')}
                              onChange={(e) =>
                                update(i, {
                                  options: e.target.value
                                    .split(',')
                                    .map((o) => o.trim())
                                    .filter(Boolean),
                                })
                              }
                              placeholder="Hàn Quốc, Vintage"
                            />
                          </div>
                        ) : null}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => remove(i)}
                        aria-label="Xoá trường"
                      >
                        <X className="size-4" />
                      </Button>
                    </div>
                    <div className="flex gap-6">
                      <label className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={a.required}
                          onCheckedChange={(v) => update(i, { required: v === true })}
                        />
                        Bắt buộc
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={a.filterable}
                          onCheckedChange={(v) => update(i, { filterable: v === true })}
                        />
                        Lọc được
                      </label>
                    </div>
                  </div>
                ))}
              </div>
              <Button type="button" variant="outline" size="sm" onClick={add}>
                <Plus className="size-4" /> Thêm thuộc tính
              </Button>
            </section>
          );
        }}
      />
    </div>
  );
}
