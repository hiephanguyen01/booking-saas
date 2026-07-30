import type {
  CreateListingGroupInput,
  ListingGroupResponse,
  ListingTypeResponse,
} from '@booking/contracts';
import { createListingGroupInputSchema } from '@booking/contracts';
import { GenericForm } from '@booking/ui/components/form/generic-form';
import type { FieldConfig } from '@booking/ui/components/form/types';
import { fieldNode, FormSurface, Section } from '~/components/form-layout';
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
    {
      name: 'title',
      type: 'text',
      label: 'Tên tin đăng',
      description: 'Ví dụ: Lumière Studio · Không gian chụp ảnh Quận 3',
      colSpan: 2,
    },
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
        slug: group?.slug,
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
      className="w-full space-y-4"
      actionsClassName="justify-end border-t pt-4"
      warnOnUnsavedChanges
      renderFields={(renderedFields, _values, form) => (
        <FormSurface>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/20 px-5 py-4 md:px-7">
            <div>
              <p className="text-xs text-muted-foreground">Loại dịch vụ</p>
              <p className="text-sm font-medium">
                {listingType.name} · Nhiều {listingType.itemLabel || 'hạng mục'}
              </p>
            </div>
            <p className="text-xs text-muted-foreground">Đường dẫn được tạo tự động khi lưu</p>
          </div>
          <Section title="Thông tin chung" description="Nội dung đại diện cho toàn bộ tin đăng.">
            {fieldNode(renderedFields, 'title')}
            {fieldNode(renderedFields, 'description')}
            {fieldNode(renderedFields, 'photos')}
          </Section>
          <AdministrativeAddressFields form={form} />
          <Section
            title="Tiện ích chung"
            description={`Chỉ thêm nội dung áp dụng cho mọi ${listingType.itemLabel || 'hạng mục'} trong tin đăng.`}
          >
            <ListingGroupAmenitiesField form={form} />
          </Section>
        </FormSurface>
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
