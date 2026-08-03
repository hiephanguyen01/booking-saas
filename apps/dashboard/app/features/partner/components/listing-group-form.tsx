import type {
  CreateListingGroupInput,
  ListingGroupResponse,
  ListingTypeResponse,
} from '@booking/contracts';
import { createListingGroupInputSchema } from '@booking/contracts';
import { GenericForm } from '@booking/ui/components/form/generic-form';
import type { FieldConfig } from '@booking/ui/components/form/types';
import { FileText, MapPinned } from 'lucide-react';
import { Fragment, type ReactNode } from 'react';
import { useNavigation } from 'react-router';
import { fieldNode } from '~/components/form-layout';
import {
  FormRailMobileActions,
  FormRailMobileNav,
  FormWizard,
  WizardContextStrip,
  WizardRail,
  WizardSection,
  WizardStepHint,
} from '~/components/form-wizard';
import { useActiveFormSection } from '~/hooks/use-active-form-section';
import { useFormWizard } from '~/hooks/use-form-wizard';
import { AdministrativeAddressFields } from './administrative-address-fields';
import { ListingGroupAmenitiesField } from './listing-group-amenities-field';
import {
  listingGroupSectionMap,
  LISTING_GROUP_STEP_FIELDS,
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
  const submitLabel = group ? 'Lưu thay đổi' : `Lưu bản nháp & thêm ${itemLabel}`;
  const isCreate = !group;
  const navigation = useNavigation();
  const isSubmitting = navigation.state === 'submitting';
  const { activeSection, navigateToSection } =
    useActiveFormSection<ListingGroupFormSectionId>('group-content');
  const wizard = useFormWizard({
    map: listingGroupSectionMap,
    fieldErrors,
    enabled: isCreate,
  });

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
      className="mx-auto w-full max-w-[1440px] space-y-4 pb-36 xl:pb-0"
      showActions={false}
      warnOnUnsavedChanges
      onInvalid={wizard.revealInvalid}
      renderFields={(renderedFields, values, form) => {
        const progress = listingGroupSectionMap.getProgress(values);
        const errorSections = listingGroupSectionMap.getErrorSections(form.formState.errors);
        const complete = (id: ListingGroupFormSectionId) =>
          (progress.items.find((item) => item.id === id)?.complete ?? false) &&
          !errorSections.has(id);
        /** In the wizard a step reads as done only once the partner has passed it. */
        const visualComplete = (id: ListingGroupFormSectionId) =>
          isCreate ? wizard.completed.has(id) && complete(id) : complete(id);
        /** Errors surface on a step only after the partner has tried to leave it. */
        const hasError = (id: ListingGroupFormSectionId) =>
          errorSections.has(id) && wizard.attempted.has(id);

        const sections = {
          'group-content': (
            <WizardSection
              id="group-content"
              step={isCreate ? 1 : undefined}
              title="Nội dung chung"
              description="Thông tin đại diện cho toàn bộ tin đăng, khách nhìn thấy trước tiên."
              icon={<FileText aria-hidden />}
              complete={visualComplete('group-content')}
              error={hasError('group-content')}
              contentClassName="space-y-7"
            >
              {isCreate ? (
                <WizardStepHint>
                  Nhập tên tin đăng. Mô tả, album chung và tiện ích có thể bổ sung sau; tiện ích đã
                  thêm phải có tên hoặc được xóa.
                </WizardStepHint>
              ) : null}
              <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(18rem,0.95fr)]">
                <div className="min-w-0 space-y-4">
                  {fieldNode(renderedFields, 'title')}
                  {fieldNode(renderedFields, 'description')}
                </div>
                <div className="min-w-0">{fieldNode(renderedFields, 'photos')}</div>
              </div>
              <div className="border-t pt-6">
                <div className="mb-4">
                  <h3 className="text-sm font-semibold">Tiện ích chung</h3>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Tùy chọn. Chỉ thêm tiện ích áp dụng cho mọi {itemLabel} trong tin đăng.
                  </p>
                </div>
                <ListingGroupAmenitiesField form={form} />
              </div>
            </WizardSection>
          ),
          'group-location': (
            <WizardSection
              id="group-location"
              step={isCreate ? 2 : undefined}
              title="Địa điểm"
              description="Địa chỉ chung sẽ được kế thừa khi bạn thêm từng hạng mục."
              icon={<MapPinned aria-hidden />}
              complete={visualComplete('group-location')}
              error={hasError('group-location')}
            >
              {isCreate ? (
                <WizardStepHint>
                  Chọn tỉnh/thành phố, phường/xã và nhập địa chỉ cụ thể.
                </WizardStepHint>
              ) : null}
              <AdministrativeAddressFields form={form} embedded />
            </WizardSection>
          ),
        } satisfies Record<ListingGroupFormSectionId, ReactNode>;

        const contextStrip = (
          <WizardContextStrip
            label="Loại dịch vụ"
            value={listingType.name}
            context={`Nhiều ${itemLabel}`}
            dirty={form.formState.isDirty}
          />
        );

        if (isCreate) {
          return (
            <FormWizard
              wizard={wizard}
              map={listingGroupSectionMap}
              sections={sections}
              progress={progress}
              errors={form.formState.errors}
              busy={isSubmitting}
              validateStep={(id) =>
                form.trigger(LISTING_GROUP_STEP_FIELDS[id], { shouldFocus: true })
              }
              contextStrip={contextStrip}
              finalLabel={submitLabel}
            />
          );
        }

        return (
          <>
            <FormRailMobileNav
              progress={progress}
              errorSections={errorSections}
              activeSection={activeSection}
              onNavigate={navigateToSection}
            />

            <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_19rem] xl:items-start">
              <div className="min-w-0 space-y-5">
                {contextStrip}

                {listingGroupSectionMap.sections.map((section) => (
                  <Fragment key={section.id}>{sections[section.id]}</Fragment>
                ))}
              </div>

              <WizardRail
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

            <FormRailMobileActions isSubmitting={isSubmitting} submitLabel={submitLabel} />
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
