import {
  createListingTypeInputSchema,
  LISTING_TYPE_ICONS,
  listingTypeIconSchema,
  listingTypeSearchConfigSchema,
  type AttributeField,
  type AttributeFieldType,
  type BookingMode,
  type CreateListingTypeInput,
  type ListingTypeIcon,
  type ListingTypeResponse,
} from '@booking/contracts';
import { GenericForm } from '@booking/ui/components/form/generic-form';
import { Controller, type UseFormReturn } from '@booking/ui/components/form/rhf';
import type { FieldConfig } from '@booking/ui/components/form/types';
import { Button } from '@booking/ui/components/ui/button';
import { Checkbox } from '@booking/ui/components/ui/checkbox';
import { Input } from '@booking/ui/components/ui/input';
import { Label } from '@booking/ui/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@booking/ui/components/ui/select';
import { cn } from '@booking/ui/lib/utils';
import * as Icons from 'lucide-react';
import { Plus, X } from 'lucide-react';
import { BOOKING_MODE_LABEL } from '~/constants/booking';
import { ATTRIBUTE_FIELD_TYPE_LABEL } from '../constants';
import {
  ListingTypeSearchConfigFields,
  normalizeSearchConfig,
} from './listing-type-search-config-fields';

const ALL_MODES: BookingMode[] = ['hourly', 'daily', 'inventory', 'appointment', 'class'];
const FIELD_TYPES: { value: AttributeFieldType; label: string }[] = (
  ['text', 'number', 'select', 'multiselect', 'boolean'] as const
).map((value) => ({ value, label: ATTRIBUTE_FIELD_TYPE_LABEL[value] }));

const isChoice = (type: AttributeFieldType): boolean => type === 'select' || type === 'multiselect';

/**
 * `listing_type.icon` is an icon NAME, not an upload. This used to be a `type:
 * 'file'` widget that produced an S3 publicUrl of ~80+ characters while the
 * contract capped `icon` at 60 — so saving an icon was IMPOSSIBLE in any
 * deployment. The contract, the unbounded-but-unset column, and the fact that no
 * surface ever rendered an <img> all say "name": a lucide key is theme-aware,
 * weightless, and re-tints with the tenant's palette. `LISTING_TYPE_ICONS` is the
 * shared allowlist — the same enum validates the write server-side.
 */
function IconGlyph({ name, className }: { name: string; className?: string }) {
  const Icon = (Icons as unknown as Record<string, Icons.LucideIcon | undefined>)[name];
  return Icon ? <Icon className={className} aria-hidden /> : null;
}

/** Vietnamese labels — the picker's search text; keys mirror LISTING_TYPE_ICONS. */
const ICON_LABEL: Record<ListingTypeIcon, string> = {
  Camera: 'Máy ảnh',
  Aperture: 'Khẩu độ',
  Video: 'Quay phim',
  Clapperboard: 'Phim trường',
  Projector: 'Máy chiếu',
  Mic: 'Micro',
  Music: 'Âm nhạc',
  Speaker: 'Loa',
  Lightbulb: 'Đèn',
  Building2: 'Toà nhà',
  House: 'Nhà',
  Hotel: 'Khách sạn',
  BedDouble: 'Phòng ngủ',
  DoorOpen: 'Phòng',
  Warehouse: 'Kho xưởng',
  Store: 'Cửa hàng',
  Armchair: 'Ghế',
  Sofa: 'Sofa',
  Bath: 'Phòng tắm',
  Landmark: 'Địa danh',
  Car: 'Ô tô',
  Bike: 'Xe đạp',
  Ship: 'Tàu thuyền',
  Plane: 'Máy bay',
  Dumbbell: 'Phòng gym',
  Trophy: 'Thể thao',
  Waves: 'Bể bơi',
  HeartPulse: 'Sức khoẻ',
  Stethoscope: 'Y tế',
  Footprints: 'Sân bãi',
  Palette: 'Trang điểm',
  Scissors: 'Cắt tóc',
  Sparkles: 'Làm đẹp',
  Brush: 'Cọ trang điểm',
  Shirt: 'Thời trang',
  Flower2: 'Hoa',
  GraduationCap: 'Lớp học',
  BookOpen: 'Khoá học',
  Users: 'Nhóm',
  Drama: 'Biểu diễn',
  PartyPopper: 'Sự kiện',
  Cake: 'Tiệc',
  Utensils: 'Ăn uống',
  Coffee: 'Cà phê',
  Tent: 'Cắm trại',
  TreePine: 'Ngoài trời',
  MapPin: 'Địa điểm',
  Package: 'Thiết bị',
  Boxes: 'Kho',
  Wrench: 'Dụng cụ',
  Laptop: 'Máy tính',
  Monitor: 'Màn hình',
  Gamepad2: 'Trò chơi',
  Baby: 'Trẻ em',
  Dog: 'Thú cưng',
  CalendarDays: 'Lịch',
  Clock: 'Giờ',
  Tag: 'Nhãn',
};

function IconPicker({
  value,
  onChange,
  error,
}: {
  value: string | undefined;
  onChange: (value: ListingTypeIcon | undefined) => void;
  error?: string;
}) {
  return (
    <section className="space-y-3 rounded-lg border p-4">
      <div>
        <h2 className="text-sm font-semibold">Biểu tượng (tuỳ chọn)</h2>
        <p className="text-xs text-muted-foreground">
          Hiển thị cạnh tên loại dịch vụ trên storefront.
        </p>
      </div>
      <div role="radiogroup" aria-label="Biểu tượng" className="flex flex-wrap gap-2">
        {LISTING_TYPE_ICONS.map((name) => {
          const selected = value === name;
          return (
            <button
              key={name}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={ICON_LABEL[name]}
              title={ICON_LABEL[name]}
              // Re-clicking the selected icon clears it — `icon` is optional.
              onClick={() => onChange(selected ? undefined : name)}
              className={cn(
                'flex size-11 items-center justify-center rounded-md border transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                selected
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <IconGlyph name={name} className="size-5" />
            </button>
          );
        })}
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </section>
  );
}

/** The scalar block — everything the field config can express. */
const fields: FieldConfig<CreateListingTypeInput>[] = [
  { name: 'name', type: 'text', label: 'Tên loại', placeholder: 'VD: Studio', colSpan: 1 },
  { name: 'slug', type: 'text', label: 'Slug', placeholder: 'studio', colSpan: 1 },
  {
    name: 'unitLabel',
    type: 'text',
    label: 'Đơn vị giá (tuỳ chọn)',
    placeholder: 'giờ',
    colSpan: 1,
  },
  { name: 'sortOrder', type: 'number', label: 'Thứ tự hiển thị', colSpan: 1 },
  { name: 'isActive', type: 'switch', label: 'Đang hoạt động', colSpan: 1 },
  {
    name: 'requiresIdentityVerification',
    type: 'switch',
    label: 'Yêu cầu xác minh danh tính',
    colSpan: 1,
  },
  {
    name: 'structure',
    type: 'select',
    label: 'Cấu trúc bài đăng',
    colSpan: 1,
    options: [
      { value: 'standalone', label: 'Một hạng mục độc lập' },
      { value: 'grouped', label: 'Một bài đăng chứa nhiều hạng mục' },
      { value: 'flexible', label: 'Cho đối tác lựa chọn' },
    ],
  },
  {
    name: 'itemLabel',
    type: 'text',
    label: 'Tên gọi hạng mục',
    description: 'Ví dụ: phòng, gói dịch vụ, sân. Mặc định là “hạng mục”.',
    placeholder: 'hạng mục',
    colSpan: 1,
    hidden: (values) => values.structure === 'standalone',
  },
];

/**
 * `ListingTypeResponse.icon` is a plain string (rows predating the allowlist must
 * still deserialize), so an unknown value is dropped rather than prefilled — it
 * would otherwise fail validation on a save the user never intended to change.
 */
function knownIcon(icon: string | null | undefined): ListingTypeIcon | undefined {
  const parsed = listingTypeIconSchema.safeParse(icon);
  return parsed.success ? parsed.data : undefined;
}

export function listingTypeFormDefaultValues(t?: ListingTypeResponse): CreateListingTypeInput {
  const structure = t?.structure ?? 'standalone';

  return {
    name: t?.name ?? '',
    slug: t?.slug ?? '',
    icon: knownIcon(t?.icon),
    unitLabel: t?.unitLabel ?? '',
    allowedModes: t?.allowedModes ?? ['hourly'],
    defaultModes: t?.defaultModes ?? [],
    sortOrder: t?.sortOrder ?? 0,
    isActive: t?.isActive ?? true,
    requiresIdentityVerification: t?.requiresIdentityVerification ?? false,
    structure,
    // A standalone type hides this field. Keep it absent so the schema does not
    // reject the hidden empty string before `transform` gets a chance to drop it.
    itemLabel: structure === 'standalone' ? undefined : (t?.itemLabel ?? ''),
    attributeSchema: t?.attributeSchema ?? [],
    searchConfig: t?.searchConfig ?? listingTypeSearchConfigSchema.parse({}),
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
      defaultValues={listingTypeFormDefaultValues(listingType)}
      submitLabel={isEdit ? 'Lưu thay đổi' : 'Tạo loại dịch vụ'}
      serverError={serverError}
      fieldErrors={fieldErrors}
      extraFields={(form) => <ModesAndAttributes form={form} />}
      transform={(d) => ({
        name: d.name.trim(),
        slug: d.slug.trim(),
        icon: d.icon || undefined,
        unitLabel: d.unitLabel?.trim() || undefined,
        allowedModes: d.allowedModes,
        defaultModes: d.defaultModes,
        sortOrder: Math.max(0, Math.round(Number(d.sortOrder) || 0)),
        isActive: d.isActive,
        requiresIdentityVerification: d.requiresIdentityVerification,
        structure: d.structure,
        itemLabel: d.structure === 'standalone' ? undefined : d.itemLabel?.trim() || undefined,
        // Drop `options` for non-choice types so it doesn't linger on the payload.
        attributeSchema: d.attributeSchema.map((a) =>
          isChoice(a.type) ? a : { ...a, options: undefined },
        ),
        searchConfig: normalizeSearchConfig(d.searchConfig, d.attributeSchema, d.allowedModes),
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
        name="icon"
        render={({ field }) => (
          <IconPicker
            value={field.value}
            onChange={field.onChange}
            error={errors.icon ? String(errors.icon.message) : undefined}
          />
        )}
      />

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
              if (form.getValues('searchConfig.schedule') === mode) {
                form.setValue('searchConfig.schedule', 'none', {
                  shouldDirty: true,
                  shouldValidate: true,
                });
              }
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
                    {BOOKING_MODE_LABEL[m]}
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
                          {BOOKING_MODE_LABEL[m]}
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
          const update = (i: number, patch: Partial<AttributeField>): void => {
            const current = rows[i];
            if (!current) return;
            const activeFacet = form
              .getValues('searchConfig.attributeFacets')
              .some((facet) => facet.key === current.key);
            if (
              patch.filterable === false &&
              current.filterable &&
              activeFacet &&
              globalThis.confirm &&
              !globalThis.confirm(
                `Tắt “Lọc được” sẽ xoá cấu hình bộ lọc “${current.label || current.key}”. Tiếp tục?`,
              )
            )
              return;

            const nextRows = rows.map((attribute, index) =>
              index === i ? { ...attribute, ...patch } : attribute,
            );
            let searchConfig = form.getValues('searchConfig');
            if (patch.key !== undefined && patch.key !== current.key) {
              searchConfig = {
                ...searchConfig,
                attributeFacets: searchConfig.attributeFacets.map((facet) =>
                  facet.key === current.key ? { ...facet, key: patch.key! } : facet,
                ),
              };
            }
            if (patch.filterable === false) {
              searchConfig = {
                ...searchConfig,
                attributeFacets: searchConfig.attributeFacets.filter(
                  (facet) => facet.key !== current.key,
                ),
              };
            }
            field.onChange(nextRows);
            form.setValue(
              'searchConfig',
              normalizeSearchConfig(searchConfig, nextRows, form.getValues('allowedModes')),
              { shouldDirty: true, shouldValidate: true },
            );
          };
          const remove = (i: number): void => {
            const current = rows[i];
            if (!current) return;
            const activeFacet = form
              .getValues('searchConfig.attributeFacets')
              .some((facet) => facet.key === current.key);
            if (
              activeFacet &&
              globalThis.confirm &&
              !globalThis.confirm(
                `Xoá thuộc tính sẽ xoá luôn bộ lọc “${current.label || current.key}”. Tiếp tục?`,
              )
            )
              return;
            const nextRows = rows.filter((_, index) => index !== i);
            field.onChange(nextRows);
            form.setValue(
              'searchConfig',
              normalizeSearchConfig(
                {
                  ...form.getValues('searchConfig'),
                  attributeFacets: form
                    .getValues('searchConfig.attributeFacets')
                    .filter((facet) => facet.key !== current.key),
                },
                nextRows,
                form.getValues('allowedModes'),
              ),
              { shouldDirty: true, shouldValidate: true },
            );
          };
          const add = (): void =>
            field.onChange([
              ...rows,
              { key: '', label: '', type: 'text', required: false, filterable: false },
            ]);

          // Per-row errors live at errors.attributeSchema[i].<field>; the
          // array-level refinement (duplicate keys) lands on the root. Neither was
          // rendered before, so an invalid row made submit a silent no-op.
          const schemaErrors = errors.attributeSchema;
          const rootMessage = schemaErrors?.message ?? schemaErrors?.root?.message;
          const rowError = (i: number, key: keyof AttributeField): string | undefined =>
            schemaErrors?.[i]?.[key]?.message;

          return (
            <section className="space-y-3 rounded-lg border p-4">
              <h2 className="text-sm font-semibold">Thuộc tính tuỳ biến</h2>
              <p className="text-xs text-muted-foreground">
                Các trường sẽ hiện khi đối tác tạo listing thuộc loại này. “Lọc được” chỉ làm cho
                thuộc tính đủ điều kiện; hãy bật và chọn kiểu hiển thị ở phần bộ lọc bên dưới.
              </p>
              {rootMessage ? (
                <p className="text-xs text-destructive">{String(rootMessage)}</p>
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
                            aria-invalid={rowError(i, 'key') ? true : undefined}
                          />
                          {rowError(i, 'key') ? (
                            <p className="text-xs text-destructive">{rowError(i, 'key')}</p>
                          ) : null}
                        </div>
                        <div className="space-y-1.5">
                          <Label>Nhãn</Label>
                          <Input
                            value={a.label}
                            onChange={(e) => update(i, { label: e.target.value })}
                            placeholder="Diện tích"
                            aria-invalid={rowError(i, 'label') ? true : undefined}
                          />
                          {rowError(i, 'label') ? (
                            <p className="text-xs text-destructive">{rowError(i, 'label')}</p>
                          ) : null}
                        </div>
                        <div className="space-y-1.5">
                          <Label>Kiểu</Label>
                          <Select
                            value={a.type}
                            onValueChange={(v) =>
                              update(i, {
                                type: v as AttributeFieldType,
                                // Reset options when leaving a choice type.
                                ...(isChoice(v as AttributeFieldType)
                                  ? {}
                                  : { options: undefined }),
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
                              aria-invalid={rowError(i, 'options') ? true : undefined}
                            />
                            {rowError(i, 'options') ? (
                              <p className="text-xs text-destructive">{rowError(i, 'options')}</p>
                            ) : null}
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

      <ListingTypeSearchConfigFields form={form} />
    </div>
  );
}
