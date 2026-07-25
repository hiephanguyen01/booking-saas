import {
  createListingTypeInputSchema,
  listingTypeSearchConfigSchema,
  type CreateListingTypeInput,
  type ListingTypeResponse,
} from '@booking/contracts';
import { GenericForm } from '@booking/ui/components/form/generic-form';
import { Controller } from '@booking/ui/components/form/rhf';
import type { FieldConfig } from '@booking/ui/components/form/types';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@booking/ui/components/ui/select';
import { isChoice, ListingTypeAttributeFields } from './listing-type-attribute-fields';
import { ListingTypeModesFields } from './listing-type-modes-fields';
import { ListingTypeSearchConfigFields } from './listing-type-search-config-fields';
import { normalizeSearchConfig } from './listing-type-search-config';

/** The scalar block — everything the field config can express. */
const fields: FieldConfig<CreateListingTypeInput>[] = [
  { name: 'name', type: 'text', label: 'Tên loại', placeholder: 'VD: Studio', colSpan: 1 },
  { name: 'slug', type: 'text', label: 'Slug', placeholder: 'studio', colSpan: 1 },
  {
    name: 'iconImageUrl',
    type: 'file',
    label: 'Biểu tượng (ảnh tải lên)',
    description: 'Ảnh hiển thị cạnh tên loại dịch vụ trên storefront. Nên dùng ảnh vuông, nền trong.',
    target: 'tenants',
    maxSizeMb: 1,
    colSpan: 2,
  },
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
    label: 'Cấu trúc tin đăng',
    colSpan: 1,
    options: [
      { value: 'standalone', label: 'Một hạng mục độc lập' },
      { value: 'grouped', label: 'Một tin đăng chứa nhiều hạng mục' },
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

export function listingTypeFormDefaultValues(t?: ListingTypeResponse): CreateListingTypeInput {
  const structure = t?.structure ?? 'standalone';

  return {
    name: t?.name ?? '',
    slug: t?.slug ?? '',
    iconImageUrl: t?.iconImageUrl ?? '',
    unitLabel: t?.unitLabel ?? '',
    bookingSelection: t?.bookingSelection ?? 'flexible_duration',
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
      extraFields={(form) => (
        // The dynamic block — icon, booking modes, custom attribute schema and the
        // storefront search config. All bound to the same react-hook-form instance,
        // so the shared zod schema validates them and their values ride along in
        // the submitted payload.
        <div className="space-y-6">
          <Controller
            control={form.control}
            name="bookingSelection"
            render={({ field }) => (
              <section className="space-y-2 rounded-lg border p-4">
                <h2 className="text-sm font-semibold">Cách khách đặt</h2>
                <Select
                  value={field.value}
                  disabled={Boolean(listingType?.listingCount)}
                  onValueChange={(value) => {
                    field.onChange(value);
                    if (value === 'fixed_packages') {
                      const allowed = form
                        .getValues('allowedModes')
                        .filter((mode) => mode === 'hourly' || mode === 'daily');
                      form.setValue('allowedModes', allowed.length ? allowed : ['hourly']);
                      form.setValue(
                        'defaultModes',
                        form
                          .getValues('defaultModes')
                          .filter((mode) => mode === 'hourly' || mode === 'daily'),
                      );
                    }
                  }}
                >
                  <SelectTrigger className="max-w-md">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="flexible_duration">Đặt thời lượng linh hoạt</SelectItem>
                    <SelectItem value="fixed_packages">Chọn gói cố định</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {listingType?.listingCount
                    ? 'Không thể đổi cách đặt vì loại này đã có tin đăng.'
                    : 'Gói cố định bắt buộc khách chọn một gói trước khi chọn lịch.'}
                </p>
              </section>
            )}
          />
          <ListingTypeModesFields form={form} />
          <ListingTypeAttributeFields form={form} />
          <ListingTypeSearchConfigFields form={form} />
        </div>
      )}
      transform={(d) => ({
        name: d.name.trim(),
        slug: d.slug.trim(),
        iconImageUrl: d.iconImageUrl || undefined,
        unitLabel: d.unitLabel?.trim() || undefined,
        bookingSelection: d.bookingSelection,
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
