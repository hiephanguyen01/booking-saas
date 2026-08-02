import type {
  CreateListingGroupInput,
  ListingGroupResponse,
  ListingTypeResponse,
} from '@booking/contracts';
import { createListingGroupInputSchema } from '@booking/contracts';
import { GenericForm } from '@booking/ui/components/form/generic-form';
import type { FieldConfig } from '@booking/ui/components/form/types';
import { FileText, MapPinned } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigation } from 'react-router';
import type { Path } from '@booking/ui/components/form/rhf';
import { fieldNode } from '~/components/form-layout';
import { AdministrativeAddressFields } from './administrative-address-fields';
import { ListingGroupAmenitiesField } from './listing-group-amenities-field';
import {
  ListingContextStrip,
  ListingFormMobileActions,
  ListingFormMobileNav,
  ListingFormRail,
  ListingFormSection,
  ListingWizardActions,
  ListingWizardNav,
  useActiveListingFormSection,
} from './listing-form-layout';
import {
  getListingGroupFormErrorSections,
  getListingGroupFormProgress,
  LISTING_GROUP_FORM_SECTIONS,
  type ListingGroupFormSectionId,
} from './listing-group-form-progress';
import { firstFormErrorField, formErrorMessagesAt } from '~/features/partner/lib/form-errors';

const GROUP_STEP_FIELDS: Record<ListingGroupFormSectionId, Path<CreateListingGroupInput>[]> = {
  'group-content': ['title', 'description', 'photos', 'amenities'],
  'group-location': ['provinceCode', 'wardCode', 'address'],
};

const GROUP_ERROR_FIELD_SECTION: Record<string, ListingGroupFormSectionId> = {
  partnerId: 'group-content',
  listingTypeId: 'group-content',
  title: 'group-content',
  description: 'group-content',
  photos: 'group-content',
  amenities: 'group-content',
  provinceCode: 'group-location',
  wardCode: 'group-location',
  address: 'group-location',
  workingArea: 'group-location',
};

function firstGroupErrorSection(errors: unknown): ListingGroupFormSectionId | undefined {
  const field = firstFormErrorField(errors);
  return field ? GROUP_ERROR_FIELD_SECTION[field] : undefined;
}

function groupSectionErrorMessages(errors: unknown, section: ListingGroupFormSectionId): string[] {
  return [
    ...new Set(
      Object.entries(GROUP_ERROR_FIELD_SECTION).flatMap(([field, fieldSection]) =>
        fieldSection === section ? formErrorMessagesAt(errors, [field]) : [],
      ),
    ),
  ];
}

function scrollToWizardTop(): void {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' });
}

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
    useActiveListingFormSection<ListingGroupFormSectionId>('group-content');
  const initialWizardIndex = useMemo(() => {
    const firstField = Object.keys(fieldErrors ?? {})[0];
    return ['provinceCode', 'wardCode', 'address', 'workingArea'].includes(firstField ?? '')
      ? 1
      : 0;
  }, [fieldErrors]);
  const [wizardIndex, setWizardIndex] = useState(initialWizardIndex);
  const [furthestWizardIndex, setFurthestWizardIndex] = useState(initialWizardIndex);
  const [completedSteps, setCompletedSteps] = useState<Set<ListingGroupFormSectionId>>(
    () => new Set(),
  );

  useEffect(() => {
    if (!isCreate) return;
    const firstField = Object.keys(fieldErrors ?? {})[0];
    const index = ['provinceCode', 'wardCode', 'address', 'workingArea'].includes(firstField ?? '')
      ? 1
      : firstField
        ? 0
        : -1;
    if (index < 0) return;
    setWizardIndex(index);
    setFurthestWizardIndex((current) => Math.max(current, index));
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(`[name="${firstField}"]`)?.focus();
    });
  }, [fieldErrors, isCreate]);

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
      onInvalid={(errors) => {
        if (!isCreate) return;
        const section = firstGroupErrorSection(errors);
        const index = LISTING_GROUP_FORM_SECTIONS.findIndex((item) => item.id === section);
        if (index < 0) return;
        setWizardIndex(index);
        setFurthestWizardIndex((current) => Math.max(current, index));
      }}
      renderFields={(renderedFields, values, form) => {
        const progress = getListingGroupFormProgress(values);
        const errorSections = getListingGroupFormErrorSections(form.formState.errors);
        const complete = (id: ListingGroupFormSectionId) =>
          (progress.items.find((item) => item.id === id)?.complete ?? false) &&
          !errorSections.has(id);
        const visualComplete = (id: ListingGroupFormSectionId) =>
          isCreate ? completedSteps.has(id) && complete(id) : complete(id);
        const hasError = (id: ListingGroupFormSectionId) => errorSections.has(id);

        const sections = {
          'group-content': (
            <ListingFormSection
              id="group-content"
              step={isCreate ? 1 : undefined}
              title="Nội dung chung"
              description="Thông tin đại diện cho toàn bộ tin đăng, khách nhìn thấy trước tiên."
              icon={<FileText aria-hidden />}
              complete={visualComplete('group-content')}
              error={hasError('group-content')}
              contentClassName="space-y-7"
            >
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
            </ListingFormSection>
          ),
          'group-location': (
            <ListingFormSection
              id="group-location"
              step={isCreate ? 2 : undefined}
              title="Địa điểm"
              description="Địa chỉ chung sẽ được kế thừa khi bạn thêm từng hạng mục."
              icon={<MapPinned aria-hidden />}
              complete={visualComplete('group-location')}
              error={hasError('group-location')}
            >
              <AdministrativeAddressFields form={form} embedded />
            </ListingFormSection>
          ),
        } satisfies Record<ListingGroupFormSectionId, ReactNode>;

        if (isCreate) {
          const current =
            LISTING_GROUP_FORM_SECTIONS[wizardIndex] ?? LISTING_GROUP_FORM_SECTIONS[0];
          const currentErrorMessages = current
            ? groupSectionErrorMessages(form.formState.errors, current.id)
            : [];
          const prerequisitesValid = (targetIndex: number) =>
            LISTING_GROUP_FORM_SECTIONS.slice(0, targetIndex).every((section) =>
              complete(section.id),
            );
          const goNext = async () => {
            if (!current) return;
            const valid = await form.trigger(GROUP_STEP_FIELDS[current.id], { shouldFocus: true });
            if (!valid) {
              window.requestAnimationFrame(() => {
                const firstInvalid = document
                  .getElementById(current.id)
                  ?.querySelector<HTMLElement>('[aria-invalid="true"]');
                firstInvalid?.focus();
                firstInvalid?.scrollIntoView({ block: 'center' });
              });
              return;
            }
            setCompletedSteps((previous) => new Set(previous).add(current.id));
            const nextIndex = Math.min(wizardIndex + 1, LISTING_GROUP_FORM_SECTIONS.length - 1);
            setWizardIndex(nextIndex);
            setFurthestWizardIndex((index) => Math.max(index, nextIndex));
            scrollToWizardTop();
          };

          return (
            <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_19rem] xl:items-start">
              <div className="order-2 min-w-0 space-y-5 xl:order-1">
                <ListingContextStrip
                  typeName={listingType.name}
                  itemContext={`Nhiều ${itemLabel}`}
                  dirty={form.formState.isDirty}
                />
                {current && hasError(current.id) ? (
                  <div
                    role="alert"
                    className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
                  >
                    <p className="font-medium">Kiểm tra phần này trước khi tiếp tục:</p>
                    {currentErrorMessages.length > 0 ? (
                      <ul className="mt-1 list-disc space-y-0.5 pl-5">
                        {currentErrorMessages.map((message) => (
                          <li key={message}>{message}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-1">Có trường chưa hợp lệ.</p>
                    )}
                  </div>
                ) : null}
                {LISTING_GROUP_FORM_SECTIONS.map((section, index) => (
                  <div
                    key={section.id}
                    hidden={index !== wizardIndex}
                    className="animate-in fade-in-0 slide-in-from-bottom-1 duration-150 motion-reduce:animate-none"
                  >
                    {sections[section.id]}
                  </div>
                ))}
                <ListingWizardActions
                  currentIndex={wizardIndex}
                  total={LISTING_GROUP_FORM_SECTIONS.length}
                  busy={isSubmitting}
                  finalLabel={submitLabel}
                  onBack={() => {
                    setWizardIndex((index) => Math.max(0, index - 1));
                    scrollToWizardTop();
                  }}
                  onNext={() => void goNext()}
                />
              </div>
              <div className="order-1 xl:order-2">
                <ListingWizardNav
                  items={LISTING_GROUP_FORM_SECTIONS}
                  currentIndex={wizardIndex}
                  furthestIndex={furthestWizardIndex}
                  completed={completedSteps}
                  canNavigate={(index) => index <= furthestWizardIndex && prerequisitesValid(index)}
                  onNavigate={(index) => {
                    if (index <= furthestWizardIndex && prerequisitesValid(index)) {
                      setWizardIndex(index);
                      scrollToWizardTop();
                    }
                  }}
                />
              </div>
            </div>
          );
        }

        return (
          <>
            <ListingFormMobileNav
              progress={progress}
              errorSections={errorSections}
              activeSection={activeSection}
              onNavigate={navigateToSection}
            />

            <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_19rem] xl:items-start">
              <div className="min-w-0 space-y-5">
                <ListingContextStrip
                  typeName={listingType.name}
                  itemContext={`Nhiều ${itemLabel}`}
                  dirty={form.formState.isDirty}
                />

                {LISTING_GROUP_FORM_SECTIONS.map((section) => sections[section.id])}
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
