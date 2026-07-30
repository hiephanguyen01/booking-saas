import type {
  CreateListingGroupInput,
  ListingGroupResponse,
  ListingTypeResponse,
} from '@booking/contracts';
import { createListingGroupInputSchema } from '@booking/contracts';
import { GenericForm } from '@booking/ui/components/form/generic-form';
import type { FieldConfig } from '@booking/ui/components/form/types';
import { FileText, MapPinned, Sparkles } from 'lucide-react';
import { useNavigation } from 'react-router';
import { fieldNode } from '~/components/form-layout';
import { AdministrativeAddressFields } from './administrative-address-fields';
import { ListingGroupAmenitiesField } from './listing-group-amenities-field';
import {
  ListingContextStrip,
  ListingFormMobileActions,
  ListingFormMobileNav,
  ListingFormRail,
  ListingFormSection,
  useActiveListingFormSection,
} from './listing-form-layout';
import {
  getListingGroupFormErrorSections,
  getListingGroupFormProgress,
  type ListingGroupFormSectionId,
} from './listing-group-form-progress';

/**
 * The "thông tin chung" form for a multi-item listing (e.g. a studio with
 * several rooms). Shares the stepped layout of `ListingForm` — the per-item
 * form partners fill next — so the whole flow reads as one design.
 */
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
  const itemLabel = listingType.itemLabel || 'hạng mục';
  const submitLabel = group ? 'Lưu thay đổi' : 'Lưu & thêm hạng mục';
  const navigation = useNavigation();
  const isSubmitting = navigation.state === 'submitting';
  const { activeSection, navigateToSection } =
    useActiveListingFormSection<ListingGroupFormSectionId>('group-content');

  const fields: FieldConfig<CreateListingGroupInput>[] = [
    {
      name: 'title',
      type: 'text',
      label: 'Tên tin đăng',
      required: true,
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
      reorderable: true,
      variant: 'gallery',
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
      submitLabel={submitLabel}
      serverError={serverError}
      fieldErrors={fieldErrors}
      className="mx-auto w-full max-w-[1440px] space-y-4 pb-24 lg:pb-0"
      showActions={false}
      warnOnUnsavedChanges
      renderFields={(renderedFields, values, form) => {
        const progress = getListingGroupFormProgress(values);
        const errorSections = getListingGroupFormErrorSections(form.formState.errors);
        const complete = (id: ListingGroupFormSectionId) =>
          progress.items.find((item) => item.id === id)?.complete ?? false;
        const hasError = (id: ListingGroupFormSectionId) => errorSections.has(id);

        return (
          <>
            <ListingFormMobileNav
              progress={progress}
              errorSections={errorSections}
              activeSection={activeSection}
              onNavigate={navigateToSection}
            />

            <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-start">
              <div className="min-w-0 space-y-5">
                <ListingContextStrip
                  typeName={listingType.name}
                  itemContext={`Nhiều ${itemLabel}`}
                  dirty={form.formState.isDirty}
                />

                <ListingFormSection
                  id="group-content"
                  step={1}
                  title="Nội dung & ảnh"
                  description="Thông tin đại diện cho toàn bộ tin đăng, khách nhìn thấy trước tiên."
                  icon={<FileText aria-hidden />}
                  complete={complete('group-content')}
                  error={hasError('group-content')}
                  contentClassName="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(18rem,0.95fr)]"
                >
                  <div className="min-w-0 space-y-4">
                    {fieldNode(renderedFields, 'title')}
                    {fieldNode(renderedFields, 'description')}
                  </div>
                  <div className="min-w-0">{fieldNode(renderedFields, 'photos')}</div>
                </ListingFormSection>

                <ListingFormSection
                  id="group-location"
                  step={2}
                  title="Địa điểm"
                  description="Địa chỉ được hiển thị cho khách và dùng để xác định khu vực hoạt động."
                  icon={<MapPinned aria-hidden />}
                  complete={complete('group-location')}
                  error={hasError('group-location')}
                >
                  <AdministrativeAddressFields form={form} embedded />
                </ListingFormSection>

                <ListingFormSection
                  id="group-amenities"
                  step={3}
                  title="Tiện ích chung"
                  description={`Chỉ thêm nội dung áp dụng cho mọi ${itemLabel} trong tin đăng.`}
                  icon={<Sparkles aria-hidden />}
                  complete={complete('group-amenities')}
                  error={hasError('group-amenities')}
                >
                  <ListingGroupAmenitiesField form={form} />
                </ListingFormSection>
              </div>

              <ListingFormRail
                progress={progress}
                errorSections={errorSections}
                activeSection={activeSection}
                dirty={form.formState.isDirty}
                isSubmitting={isSubmitting}
                submitLabel={submitLabel}
                onNavigate={navigateToSection}
                hint={
                  group
                    ? 'Tin đăng được lưu ở trạng thái nháp để bạn kiểm tra.'
                    : `Sau khi lưu, bạn sẽ thêm giá và lịch đặt cho từng ${itemLabel}.`
                }
              />
            </div>

            <ListingFormMobileActions
              progress={progress}
              isSubmitting={isSubmitting}
              submitLabel={submitLabel}
            />
          </>
        );
      }}
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
