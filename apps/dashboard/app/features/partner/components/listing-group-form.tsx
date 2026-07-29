import type {
  CreateListingGroupInput,
  ListingGroupResponse,
  ListingTypeResponse,
} from '@booking/contracts';
import { createListingGroupInputSchema } from '@booking/contracts';
import { GenericForm } from '@booking/ui/components/form/generic-form';
import type { FieldConfig } from '@booking/ui/components/form/types';
import { AdministrativeAddressFields } from './administrative-address-fields';
import { ListingGroupAmenitiesField } from './listing-group-amenities-field';

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
    { name: 'slug', type: 'text', label: 'Slug', placeholder: 'ten-tin-dang', colSpan: 1 },
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
          <ListingGroupAmenitiesField form={form} />
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
