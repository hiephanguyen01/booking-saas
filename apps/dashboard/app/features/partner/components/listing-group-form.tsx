import type {
  CreateListingGroupInput,
  ListingGroupResponse,
  ListingTypeResponse,
} from '@booking/contracts';
import { createListingGroupInputSchema } from '@booking/contracts';
import { Controller } from '@booking/ui/components/form/rhf';
import { GenericForm } from '@booking/ui/components/form/generic-form';
import type { FieldConfig } from '@booking/ui/components/form/types';
import { Input } from '@booking/ui/components/ui/input';
import { Field, FieldDescription, FieldLabel } from '@booking/ui/components/ui/field';
import { AdministrativeAddressFields } from './administrative-address-fields';

export function ListingGroupForm({
  partnerId,
  listingType,
  group,
  serverError,
  fieldErrors,
}: {
  partnerId: string;
  listingType: ListingTypeResponse;
  group?: ListingGroupResponse;
  serverError?: string | null;
  fieldErrors?: Record<string, string[]> | null;
}) {
  const fields: FieldConfig<CreateListingGroupInput>[] = [
    { name: 'title', type: 'text', label: 'Tên tin đăng', colSpan: 1 },
    { name: 'slug', type: 'text', label: 'Slug', placeholder: 'ten-bai-dang', colSpan: 1 },
    { name: 'description', type: 'textarea', label: 'Mô tả', rows: 6, colSpan: 2 },
    {
      name: 'photos',
      type: 'file',
      label: 'Album chung',
      target: 'groups',
      multiple: true,
      maxFiles: 12,
      colSpan: 2,
    },
    { name: 'workingArea', type: 'text', label: 'Khu vực hoạt động (tuỳ chọn)', colSpan: 1 },
  ];

  return (
    <GenericForm
      schema={createListingGroupInputSchema}
      fields={fields}
      columns={2}
      defaultValues={{
        partnerId,
        listingTypeId: listingType.id,
        title: group?.title ?? '',
        slug: group?.slug ?? '',
        description: group?.description ?? undefined,
        provinceCode: group?.provinceCode ?? '',
        wardCode: group?.wardCode ?? '',
        address: group?.address ?? '',
        workingArea: group?.workingArea ?? undefined,
        amenities: group?.amenities ?? [],
        photos: group?.photos ?? [],
      }}
      submitLabel={group ? 'Lưu thay đổi' : 'Lưu & thêm hạng mục'}
      serverError={serverError}
      fieldErrors={fieldErrors}
      extraFields={(form) => (
        <div className="space-y-6">
          <AdministrativeAddressFields form={form} />
          <Controller
            control={form.control}
            name="amenities"
            render={({ field }) => (
              <Field>
                <FieldLabel htmlFor="group-amenities">Tiện ích hoặc thông tin chung</FieldLabel>
                <Input
                  id="group-amenities"
                  value={(field.value ?? []).join(', ')}
                  onBlur={field.onBlur}
                  onChange={(event) =>
                    field.onChange(
                      event.target.value
                        .split(',')
                        .map((value) => value.trim())
                        .filter(Boolean),
                    )
                  }
                  placeholder="Bãi đỗ xe, lễ tân, wifi"
                />
                <FieldDescription>Phân tách các mục bằng dấu phẩy.</FieldDescription>
              </Field>
            )}
          />
        </div>
      )}
      transform={(values) => ({
        ...values,
        description: values.description?.trim() || undefined,
        address: values.address.trim(),
        workingArea: values.workingArea?.trim() || undefined,
        photos: values.photos.filter(Boolean),
      })}
    />
  );
}
