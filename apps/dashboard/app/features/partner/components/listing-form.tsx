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
  ListingWizardActions,
  ListingWizardNav,
  useActiveListingFormSection,
} from './listing-form-layout';
import {
  getListingFormErrorSections,
  getListingFormProgress,
  LISTING_FORM_SECTIONS,
  type ListingFormSectionId,
} from './listing-form-progress';

const CREATE_STEP_FIELDS: Record<ListingFormSectionId, Path<CreateListingInput>[]> = {
  'listing-content': ['title'],
  'listing-location': ['provinceCode', 'wardCode', 'address'],
  'listing-pricing': ['bookingModes', 'modeConfig', 'stockQuantity'],
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
  const [completedWizardSteps, setCompletedWizardSteps] = useState<Set<ListingFormSectionId>>(
    () => new Set(),
  );
  const [useGroupAddress, setUseGroupAddress] = useState(Boolean(inheritedAddress && !listing));
  const nextAfterCreateRef = useRef<'group' | 'add-another'>('group');

  useEffect(() => {
    if (experience !== 'create-wizard') return;
    const firstField = Object.keys(fieldErrors ?? {})[0];
    const section = firstField ? ERROR_FIELD_SECTION[firstField] : undefined;
    const index = LISTING_FORM_SECTIONS.findIndex((item) => item.id === section);
    if (index < 0) return;
    setWizardIndex(index);
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(`[name="${firstField}"]`)?.focus();
    });
  }, [experience, fieldErrors]);

  return (
    <GenericForm
      schema={createListingInputSchema}
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
      className="mx-auto w-full max-w-[1440px] space-y-4 pb-24 lg:pb-0"
      showActions={false}
      warnOnUnsavedChanges
      renderFields={(renderedFields, values, form) => {
        const selectedType =
          listingTypes.find((type) => type.id === values.listingTypeId) ?? listingTypes[0];
        const progress = getListingFormProgress(values);
        const errorSections = getListingFormErrorSections(form.formState.errors);
        const complete = (id: ListingFormSectionId) =>
          progress.items.find((item) => item.id === id)?.complete ?? false;
        const visualComplete = (id: ListingFormSectionId) =>
          experience === 'create-wizard' ? completedWizardSteps.has(id) : complete(id);
        const hasError = (id: ListingFormSectionId) => errorSections.has(id);
        const inventoryOnly =
          selectedType?.allowedModes.length === 1 && selectedType.allowedModes[0] === 'inventory';
        const typeName = selectedType?.name.toLocaleLowerCase('vi') ?? '';
        const capacityNotApplicable =
          inventoryOnly || ['nhiếp ảnh', 'makeup', 'model'].includes(typeName);

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
              contentClassName="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(18rem,0.95fr)]"
            >
              <div className="min-w-0 space-y-4">
                {fieldNode(renderedFields, 'listingTypeId')}
                {fieldNode(renderedFields, 'title')}
                {fieldNode(renderedFields, 'description')}
              </div>
              <div className="min-w-0">{fieldNode(renderedFields, 'photos')}</div>
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
              <ListingConfig form={form} listingTypes={listingTypes} listing={listing} embedded />
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
          const goNext = async () => {
            if (!current) return;
            const valid = await form.trigger(CREATE_STEP_FIELDS[current.id], {
              shouldFocus: true,
            });
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
            setCompletedWizardSteps((previous) => new Set(previous).add(current.id));
            setWizardIndex((index) => Math.min(index + 1, LISTING_FORM_SECTIONS.length - 1));
            scrollToWizardTop();
          };

          return (
            <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-start">
              <div className="order-2 min-w-0 space-y-5 lg:order-1">
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
                    Kiểm tra các trường được đánh dấu trong phần này trước khi tiếp tục.
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
              <div className="order-1 lg:order-2">
                <ListingWizardNav
                  items={LISTING_FORM_SECTIONS}
                  currentIndex={wizardIndex}
                  completed={completedWizardSteps}
                  onNavigate={(index) => {
                    if (
                      index <= wizardIndex ||
                      completedWizardSteps.has(LISTING_FORM_SECTIONS[index]!.id)
                    ) {
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

            <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-start">
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
