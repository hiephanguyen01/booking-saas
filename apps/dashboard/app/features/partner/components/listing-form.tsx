import {
  createListingInputSchema,
  type CancellationPolicyResponse,
  type CreateListingInput,
  type ListingResponse,
  type ListingTypeResponse,
} from '@booking/contracts';
import { GenericForm } from '@booking/ui/components/form/generic-form';
import { BadgeDollarSign, FileText, MapPinned, Settings2, ShieldCheck } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigation } from 'react-router';
import type { Path } from '@booking/ui/components/form/rhf';
import { Switch } from '@booking/ui/components/ui/switch';
import { fieldNode, Grid } from '~/components/form-layout';
import { AdministrativeAddressFields } from './administrative-address-fields';
import { ListingCancellationPolicyField } from './listing-cancellation-policy-field';
import { ListingConfig } from './listing-config';
import { listingFormDefaults, listingFormFields } from './listing-form-fields';
import {
  ListingContextStrip,
  ListingFormMobileActions,
  ListingFormMobileNav,
  ListingFormRail,
  ListingFormSection,
  ListingStepRequirements,
  ListingWizardActions,
  ListingWizardNav,
  InvalidateIncompleteWizardSteps,
  useActiveListingFormSection,
} from './listing-form-layout';
import {
  getListingFormErrorSections,
  getListingFormProgress,
  LISTING_FORM_SECTIONS,
  type ListingFormSectionId,
} from './listing-form-progress';
import { firstFormErrorField, formErrorMessagesAt } from '~/features/partner/lib/form-errors';
import { validateListingAttributes } from '~/features/partner/lib/listing-attribute-validation';

const CREATE_STEP_FIELDS: Record<ListingFormSectionId, Path<CreateListingInput>[]> = {
  'listing-content': ['title', 'description', 'photos'],
  'listing-location': ['provinceCode', 'wardCode', 'address'],
  'listing-pricing': ['bookingModes', 'modeConfig', 'stockQuantity', 'attributes'],
  'listing-operations': ['capacity', 'bufferBefore', 'bufferAfter', 'approvalRequired'],
  'listing-payment': ['depositPercent', 'balanceDue', 'cancellationPolicyId'],
};

const ERROR_FIELD_SECTION: Record<string, ListingFormSectionId> = {
  title: 'listing-content',
  description: 'listing-content',
  photos: 'listing-content',
  provinceCode: 'listing-location',
  wardCode: 'listing-location',
  address: 'listing-location',
  bookingModes: 'listing-pricing',
  modeConfig: 'listing-pricing',
  stockQuantity: 'listing-pricing',
  attributes: 'listing-pricing',
  capacity: 'listing-operations',
  bufferBefore: 'listing-operations',
  bufferAfter: 'listing-operations',
  approvalRequired: 'listing-operations',
  depositPercent: 'listing-payment',
  balanceDue: 'listing-payment',
  cancellationPolicyId: 'listing-payment',
};

function firstListingErrorSection(errors: unknown): ListingFormSectionId | undefined {
  const field = firstFormErrorField(errors);
  return field ? ERROR_FIELD_SECTION[field] : undefined;
}

function listingSectionErrorMessages(errors: unknown, section: ListingFormSectionId): string[] {
  const messages = Object.entries(ERROR_FIELD_SECTION).flatMap(([field, fieldSection]) =>
    fieldSection === section ? formErrorMessagesAt(errors, [field]) : [],
  );
  return [...new Set(messages)];
}

function scrollToWizardTop(): void {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' });
}

/**
 * The partner listing create/edit form. Static fields come from
 * `listing-form-fields`; the dynamic block (booking modes, per-mode config,
 * attributes) is `ListingConfig`, whose mode-config round-trip lives in
 * `../lib/listing-mode-config` (pure, load-bearing, specced).
 */
export function ListingForm({
  listingTypes,
  partnerId,
  listing,
  serverError,
  fieldErrors,
  groupId,
  lockedListingTypeId,
  cancellationPolicies = [],
  minimumDepositPercent,
  mode,
  inheritedAddress,
}: {
  listingTypes: ListingTypeResponse[];
  partnerId: string;
  listing?: ListingResponse;
  serverError?: string | null;
  fieldErrors?: Record<string, string[]> | null;
  groupId?: string;
  lockedListingTypeId?: string;
  cancellationPolicies?: CancellationPolicyResponse[];
  minimumDepositPercent?: number | null;
  mode?: 'create-wizard' | 'edit-workspace';
  inheritedAddress?: { provinceCode: string; wardCode: string; address: string };
}) {
  const isEdit = Boolean(listing);
  const experience = mode ?? (isEdit ? 'edit-workspace' : 'create-wizard');
  const submitLabel = isEdit ? 'Lưu thay đổi' : groupId ? 'Về tin đăng' : 'Lưu bản nháp';
  const navigation = useNavigation();
  const isSubmitting = navigation.state === 'submitting';
  const { activeSection, navigateToSection } =
    useActiveListingFormSection<ListingFormSectionId>('listing-content');
  const initialWizardIndex = useMemo(() => {
    const firstErrorField = Object.keys(fieldErrors ?? {})[0];
    const errorSection = firstErrorField ? ERROR_FIELD_SECTION[firstErrorField] : undefined;
    return Math.max(
      0,
      LISTING_FORM_SECTIONS.findIndex((section) => section.id === errorSection),
    );
  }, [fieldErrors]);
  const [wizardIndex, setWizardIndex] = useState(initialWizardIndex);
  const [furthestWizardIndex, setFurthestWizardIndex] = useState(initialWizardIndex);
  const [completedWizardSteps, setCompletedWizardSteps] = useState<Set<ListingFormSectionId>>(
    () => new Set(),
  );
  const [attemptedWizardSteps, setAttemptedWizardSteps] = useState<Set<ListingFormSectionId>>(
    () => new Set(),
  );
  const [useGroupAddress, setUseGroupAddress] = useState(Boolean(inheritedAddress && !listing));
  const nextAfterCreateRef = useRef<'group' | 'add-another'>('group');
  const listingFormSchema = useMemo(
    () =>
      createListingInputSchema.superRefine((values, context) => {
        const type = listingTypes.find((item) => item.id === values.listingTypeId);
        if (type) {
          for (const issue of validateListingAttributes(type.attributeSchema, values.attributes)) {
            context.addIssue({
              code: 'custom',
              path: ['attributes', issue.key],
              message: issue.message,
            });
          }
        }
        if (
          minimumDepositPercent !== null &&
          minimumDepositPercent !== undefined &&
          values.depositPercent < minimumDepositPercent
        ) {
          context.addIssue({
            code: 'custom',
            path: ['depositPercent'],
            message: `Tỷ lệ đặt cọc phải từ ${minimumDepositPercent}% trở lên`,
          });
        }
      }),
    [listingTypes, minimumDepositPercent],
  );

  useEffect(() => {
    if (experience !== 'create-wizard') return;
    const firstField = Object.keys(fieldErrors ?? {})[0];
    const section = firstField ? ERROR_FIELD_SECTION[firstField] : undefined;
    const index = LISTING_FORM_SECTIONS.findIndex((item) => item.id === section);
    if (index < 0) return;
    setWizardIndex(index);
    setFurthestWizardIndex((current) => Math.max(current, index));
    if (section) {
      setAttemptedWizardSteps((previous) => new Set(previous).add(section));
    }
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(`[name="${firstField}"]`)?.focus();
    });
  }, [experience, fieldErrors]);

  return (
    <GenericForm
      schema={listingFormSchema}
      fields={listingFormFields({
        listingTypes,
        isEdit,
        lockedListingTypeId,
        selectedListingTypeId: listing?.listingTypeId,
        minimumDepositPercent,
      })}
      columns={2}
      defaultValues={listingFormDefaults({
        partnerId,
        listingTypes,
        listing,
        groupId,
        lockedListingTypeId,
        inheritedAddress,
      })}
      submitLabel={submitLabel}
      serverError={serverError}
      fieldErrors={fieldErrors}
      className="mx-auto w-full max-w-[1440px] space-y-4 pb-36 xl:pb-0"
      showActions={false}
      warnOnUnsavedChanges
      onInvalid={(errors) => {
        if (experience !== 'create-wizard') return;
        const invalidSections = getListingFormErrorSections(errors);
        setAttemptedWizardSteps((previous) => new Set([...previous, ...invalidSections]));
        const section = firstListingErrorSection(errors);
        const index = LISTING_FORM_SECTIONS.findIndex((item) => item.id === section);
        if (index < 0) return;
        setWizardIndex(index);
        setFurthestWizardIndex((current) => Math.max(current, index));
      }}
      renderFields={(renderedFields, values, form) => {
        const selectedType =
          listingTypes.find((type) => type.id === values.listingTypeId) ?? listingTypes[0];
        const progress = getListingFormProgress(values, listingFormSchema);
        const errorSections = getListingFormErrorSections(form.formState.errors);
        const visibleErrorSections = new Set(
          [...errorSections].filter((section) => attemptedWizardSteps.has(section)),
        );
        const complete = (id: ListingFormSectionId) =>
          (progress.items.find((item) => item.id === id)?.complete ?? false) &&
          !errorSections.has(id);
        const visualComplete = (id: ListingFormSectionId) =>
          experience === 'create-wizard'
            ? completedWizardSteps.has(id) && complete(id)
            : complete(id);
        const hasError = (id: ListingFormSectionId) => visibleErrorSections.has(id);
        const inventoryOnly =
          selectedType?.allowedModes.length === 1 && selectedType.allowedModes[0] === 'inventory';
        const capacityNotApplicable =
          inventoryOnly || ['photography', 'makeup', 'model'].includes(selectedType?.slug ?? '');
        const requiredAttributeLabels =
          selectedType?.attributeSchema
            .filter((attribute) => attribute.required)
            .map((attribute) => attribute.label) ?? [];
        const itemLabel = selectedType?.itemLabel || 'hạng mục';

        const sectionNodes: Record<ListingFormSectionId, ReactNode> = {
          'listing-content': (
            <ListingFormSection
              id="listing-content"
              step={experience === 'create-wizard' ? 1 : undefined}
              title="Nội dung & hình ảnh"
              description="Thông tin đầu tiên khách nhìn thấy khi tìm và so sánh dịch vụ."
              icon={<FileText aria-hidden />}
              complete={visualComplete('listing-content')}
              error={hasError('listing-content')}
              contentClassName="space-y-5"
            >
              {experience === 'create-wizard' ? (
                <ListingStepRequirements>
                  Nhập tên {itemLabel}. Mô tả và hình ảnh có thể bổ sung sau khi lưu bản nháp.
                </ListingStepRequirements>
              ) : null}
              <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(18rem,0.95fr)]">
                <div className="min-w-0 space-y-4">
                  {fieldNode(renderedFields, 'listingTypeId')}
                  {fieldNode(renderedFields, 'title')}
                  {fieldNode(renderedFields, 'description')}
                </div>
                <div className="min-w-0">{fieldNode(renderedFields, 'photos')}</div>
              </div>
            </ListingFormSection>
          ),
          'listing-location': (
            <ListingFormSection
              id="listing-location"
              step={experience === 'create-wizard' ? 2 : undefined}
              title="Địa điểm"
              description="Địa chỉ được hiển thị cho khách và dùng để xác định khu vực hoạt động."
              icon={<MapPinned aria-hidden />}
              complete={visualComplete('listing-location')}
              error={hasError('listing-location')}
            >
              {experience === 'create-wizard' ? (
                <ListingStepRequirements>
                  Chọn tỉnh/thành phố, phường/xã và nhập địa chỉ cụ thể.
                </ListingStepRequirements>
              ) : null}
              {inheritedAddress && !listing ? (
                <div className="mb-5 flex items-start justify-between gap-4 rounded-xl border bg-muted/30 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">Dùng địa chỉ chung</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {inheritedAddress.address}. Tắt lựa chọn này nếu hạng mục ở địa chỉ khác.
                    </p>
                  </div>
                  <Switch
                    checked={useGroupAddress}
                    aria-label="Dùng địa chỉ chung"
                    onCheckedChange={(checked) => {
                      setUseGroupAddress(checked);
                      if (checked) {
                        form.setValue('provinceCode', inheritedAddress.provinceCode, {
                          shouldDirty: true,
                        });
                        form.setValue('wardCode', inheritedAddress.wardCode, { shouldDirty: true });
                        form.setValue('address', inheritedAddress.address, { shouldDirty: true });
                      } else {
                        form.setValue('provinceCode', '', { shouldDirty: true });
                        form.setValue('wardCode', '', { shouldDirty: true });
                        form.setValue('address', '', { shouldDirty: true });
                      }
                    }}
                  />
                </div>
              ) : null}
              <AdministrativeAddressFields form={form} embedded disabled={useGroupAddress} />
            </ListingFormSection>
          ),
          'listing-pricing': (
            <ListingFormSection
              id="listing-pricing"
              step={experience === 'create-wizard' ? 3 : undefined}
              title="Dịch vụ & giá"
              description="Chọn cách khách đặt chỗ và thiết lập giá phù hợp với loại dịch vụ."
              icon={<BadgeDollarSign aria-hidden />}
              complete={visualComplete('listing-pricing')}
              error={hasError('listing-pricing')}
            >
              {experience === 'create-wizard' ? (
                <ListingStepRequirements>
                  {requiredAttributeLabels.length > 0
                    ? `Điền ${requiredAttributeLabels.join(', ')}; `
                    : ''}
                  giữ ít nhất một hình thức đặt và hoàn tất cấu hình đang bật.
                  {selectedType?.bookingSelection === 'fixed_packages'
                    ? ' Có thể lưu nháp chưa có gói; gói đã thêm phải đủ tên, thời lượng và giá.'
                    : inventoryOnly
                      ? ' Giá thuê và số lượng cho thuê phải lớn hơn 0.'
                      : ' Giá 0 vẫn được lưu nháp nhưng chưa đủ điều kiện gửi duyệt.'}
                </ListingStepRequirements>
              ) : null}
              <ListingConfig
                form={form}
                listingTypes={listingTypes}
                listing={listing}
                embedded
                validateOnChange={
                  attemptedWizardSteps.has('listing-pricing') ||
                  completedWizardSteps.has('listing-pricing')
                }
              />
            </ListingFormSection>
          ),
          'listing-operations': (
            <ListingFormSection
              id="listing-operations"
              step={experience === 'create-wizard' ? 4 : undefined}
              title={inventoryOnly ? 'Xác nhận đặt thuê' : 'Vận hành'}
              description={
                inventoryOnly
                  ? 'Chọn có cần duyệt yêu cầu của khách trước khi thanh toán hay không.'
                  : 'Thiết lập sức chứa, khoảng nghỉ và quy trình duyệt trước khi thanh toán.'
              }
              icon={<Settings2 aria-hidden />}
              complete={visualComplete('listing-operations')}
              error={hasError('listing-operations')}
            >
              <div className="space-y-4">
                {experience === 'create-wizard' ? (
                  <ListingStepRequirements required={false}>
                    Không cần thao tác nếu các giá trị mặc định phù hợp. Trường đã nhập phải là số
                    hợp lệ.
                  </ListingStepRequirements>
                ) : null}
                {!inventoryOnly ? (
                  <Grid>
                    {!capacityNotApplicable ? fieldNode(renderedFields, 'capacity') : null}
                    {fieldNode(renderedFields, 'bufferBefore')}
                    {fieldNode(renderedFields, 'bufferAfter')}
                  </Grid>
                ) : null}
                {fieldNode(renderedFields, 'approvalRequired')}
              </div>
            </ListingFormSection>
          ),
          'listing-payment': (
            <ListingFormSection
              id="listing-payment"
              step={experience === 'create-wizard' ? 5 : undefined}
              title="Thanh toán & kiểm tra"
              description="Kiểm tra tiền giữ chỗ và chính sách hủy trước khi lưu bản nháp."
              icon={<ShieldCheck aria-hidden />}
              complete={visualComplete('listing-payment')}
              error={hasError('listing-payment')}
            >
              <div className="space-y-6">
                {experience === 'create-wizard' ? (
                  <ListingStepRequirements>
                    Có thể giữ hình thức thanh toán và chính sách mặc định. Tỷ lệ đặt cọc phải từ{' '}
                    {minimumDepositPercent ?? 0}% trở lên.
                  </ListingStepRequirements>
                ) : null}
                <div>
                  <h3 className="mb-3 text-sm font-semibold">Điều kiện thanh toán</h3>
                  <Grid>
                    {fieldNode(renderedFields, 'depositPercent')}
                    {fieldNode(renderedFields, 'balanceDue')}
                  </Grid>
                </div>
                <div className="border-t pt-5">
                  <h3 className="mb-1 text-sm font-semibold">Chính sách hủy</h3>
                  <p className="mb-4 text-xs leading-5 text-muted-foreground">
                    Dùng chính sách mặc định hoặc chọn riêng cho tin đăng này.
                  </p>
                  <ListingCancellationPolicyField
                    form={form}
                    policies={cancellationPolicies}
                    embedded
                  />
                </div>
              </div>
            </ListingFormSection>
          ),
        };

        if (experience === 'create-wizard') {
          const current = LISTING_FORM_SECTIONS[wizardIndex] ?? LISTING_FORM_SECTIONS[0];
          const currentHasError = current ? hasError(current.id) : false;
          const currentErrorMessages = current
            ? listingSectionErrorMessages(form.formState.errors, current.id)
            : [];
          const prerequisitesValid = (targetIndex: number) =>
            LISTING_FORM_SECTIONS.slice(0, targetIndex).every((section) => complete(section.id));
          const goNext = async () => {
            if (!current) return;
            setAttemptedWizardSteps((previous) => new Set(previous).add(current.id));
            const valid = await form.trigger(CREATE_STEP_FIELDS[current.id], {
              shouldFocus: true,
            });
            if (!valid) {
              window.requestAnimationFrame(() => {
                window.requestAnimationFrame(() => {
                  const firstInvalid = document
                    .getElementById(current.id)
                    ?.querySelector<HTMLElement>('[aria-invalid="true"]');
                  firstInvalid?.focus();
                  firstInvalid?.scrollIntoView({ block: 'center' });
                });
              });
              return;
            }
            setCompletedWizardSteps((previous) => new Set(previous).add(current.id));
            const nextIndex = Math.min(wizardIndex + 1, LISTING_FORM_SECTIONS.length - 1);
            setWizardIndex(nextIndex);
            setFurthestWizardIndex((index) => Math.max(index, nextIndex));
            scrollToWizardTop();
          };

          return (
            <>
              <InvalidateIncompleteWizardSteps
                items={progress.items}
                completed={completedWizardSteps}
                setCompleted={setCompletedWizardSteps}
              />
              <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_19rem] xl:items-start">
                <div className="order-2 min-w-0 space-y-5 xl:order-1">
                  <ListingContextStrip
                    typeName={selectedType?.name ?? 'Chưa chọn'}
                    itemContext={groupId ? 'Hạng mục trong tin đăng' : 'Một hạng mục độc lập'}
                    dirty={form.formState.isDirty}
                  />
                  {currentHasError ? (
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
                  {LISTING_FORM_SECTIONS.map((section, index) => (
                    <div
                      key={section.id}
                      hidden={index !== wizardIndex}
                      className="animate-in fade-in-0 slide-in-from-bottom-1 duration-150 motion-reduce:animate-none"
                    >
                      {sectionNodes[section.id]}
                    </div>
                  ))}
                  {groupId && wizardIndex === LISTING_FORM_SECTIONS.length - 1 ? (
                    <p className="text-xs text-muted-foreground">
                      Cả hai lựa chọn bên dưới đều lưu hạng mục trước khi chuyển trang.
                    </p>
                  ) : null}
                  <ListingWizardActions
                    currentIndex={wizardIndex}
                    total={LISTING_FORM_SECTIONS.length}
                    busy={isSubmitting}
                    finalLabel={submitLabel}
                    secondaryFinalLabel={
                      groupId ? `Thêm ${selectedType?.itemLabel || 'hạng mục'} khác` : undefined
                    }
                    onSecondaryFinal={() => {
                      nextAfterCreateRef.current = 'add-another';
                    }}
                    onFinal={() => {
                      nextAfterCreateRef.current = 'group';
                    }}
                    onBack={() => {
                      setWizardIndex((index) => Math.max(0, index - 1));
                      scrollToWizardTop();
                    }}
                    onNext={() => void goNext()}
                  />
                </div>
                <div className="order-1 xl:order-2">
                  <ListingWizardNav
                    items={LISTING_FORM_SECTIONS}
                    currentIndex={wizardIndex}
                    furthestIndex={furthestWizardIndex}
                    completed={completedWizardSteps}
                    canNavigate={(index) =>
                      index <= furthestWizardIndex && prerequisitesValid(index)
                    }
                    onNavigate={(index) => {
                      if (index <= furthestWizardIndex && prerequisitesValid(index)) {
                        setWizardIndex(index);
                        scrollToWizardTop();
                      }
                    }}
                  />
                </div>
              </div>
            </>
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
                  typeName={selectedType?.name ?? 'Chưa chọn'}
                  itemContext={groupId ? 'Hạng mục trong tin đăng' : 'Một hạng mục độc lập'}
                  dirty={form.formState.isDirty}
                />

                {LISTING_FORM_SECTIONS.map((section) => sectionNodes[section.id])}
              </div>

              <ListingFormRail
                progress={progress}
                errorSections={errorSections}
                activeSection={activeSection}
                dirty={form.formState.isDirty}
                isSubmitting={isSubmitting}
                submitLabel={submitLabel}
                onNavigate={navigateToSection}
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
      transform={(d) => ({
        ...d,
        description: d.description?.trim() || undefined,
        address: d.address.trim(),
        photos: (d.photos ?? []).filter(Boolean),
        ...(groupId ? { next: nextAfterCreateRef.current } : {}),
      })}
    />
  );
}
