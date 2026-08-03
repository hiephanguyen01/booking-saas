import {
  createListingInputSchema,
  type CancellationPolicyResponse,
  type ListingResponse,
  type ListingTypeResponse,
} from '@booking/contracts';
import { GenericForm } from '@booking/ui/components/form/generic-form';
import { BadgeDollarSign, FileText, MapPinned, Settings2, ShieldCheck } from 'lucide-react';
import { Fragment, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigation } from 'react-router';
import { Switch } from '@booking/ui/components/ui/switch';
import { fieldNode, Grid } from '~/components/form-layout';
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
import { ListingCancellationPolicyField } from './listing-cancellation-policy-field';
import { ListingConfig } from './listing-config';
import { listingFormDefaults, listingFormFields } from './listing-form-fields';
import {
  getListingFormProgress,
  listingSectionMap,
  LISTING_STEP_FIELDS,
  type ListingFormSectionId,
} from './listing-form-progress';
import { validateListingAttributes } from '~/features/partner/lib/listing-attribute-validation';

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
  const isWizard = experience === 'create-wizard';
  const { activeSection, navigateToSection } =
    useActiveFormSection<ListingFormSectionId>('listing-content');
  const wizard = useFormWizard({
    map: listingSectionMap,
    fieldErrors,
    enabled: isWizard,
  });
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
      onInvalid={wizard.revealInvalid}
      renderFields={(renderedFields, values, form) => {
        const selectedType =
          listingTypes.find((type) => type.id === values.listingTypeId) ?? listingTypes[0];
        const progress = getListingFormProgress(values, listingFormSchema);
        const errorSections = listingSectionMap.getErrorSections(form.formState.errors);
        const complete = (id: ListingFormSectionId) =>
          (progress.items.find((item) => item.id === id)?.complete ?? false) &&
          !errorSections.has(id);
        /** In the wizard a step reads as done only once the partner has passed it. */
        const visualComplete = (id: ListingFormSectionId) =>
          isWizard ? wizard.completed.has(id) && complete(id) : complete(id);
        /** Errors surface on a step only after the partner has tried to leave it. */
        const hasError = (id: ListingFormSectionId) =>
          errorSections.has(id) && wizard.attempted.has(id);
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
            <WizardSection
              id="listing-content"
              step={isWizard ? 1 : undefined}
              title="Nội dung & hình ảnh"
              description="Thông tin đầu tiên khách nhìn thấy khi tìm và so sánh dịch vụ."
              icon={<FileText aria-hidden />}
              complete={visualComplete('listing-content')}
              error={hasError('listing-content')}
              contentClassName="space-y-5"
            >
              {isWizard ? (
                <WizardStepHint>
                  Nhập tên {itemLabel}. Mô tả và hình ảnh có thể bổ sung sau khi lưu bản nháp.
                </WizardStepHint>
              ) : null}
              <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(18rem,0.95fr)]">
                <div className="min-w-0 space-y-4">
                  {fieldNode(renderedFields, 'listingTypeId')}
                  {fieldNode(renderedFields, 'title')}
                  {fieldNode(renderedFields, 'description')}
                </div>
                <div className="min-w-0">{fieldNode(renderedFields, 'photos')}</div>
              </div>
            </WizardSection>
          ),
          'listing-location': (
            <WizardSection
              id="listing-location"
              step={isWizard ? 2 : undefined}
              title="Địa điểm"
              description="Địa chỉ được hiển thị cho khách và dùng để xác định khu vực hoạt động."
              icon={<MapPinned aria-hidden />}
              complete={visualComplete('listing-location')}
              error={hasError('listing-location')}
            >
              {isWizard ? (
                <WizardStepHint>
                  Chọn tỉnh/thành phố, phường/xã và nhập địa chỉ cụ thể.
                </WizardStepHint>
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
            </WizardSection>
          ),
          'listing-pricing': (
            <WizardSection
              id="listing-pricing"
              step={isWizard ? 3 : undefined}
              title="Dịch vụ & giá"
              description="Chọn cách khách đặt chỗ và thiết lập giá phù hợp với loại dịch vụ."
              icon={<BadgeDollarSign aria-hidden />}
              complete={visualComplete('listing-pricing')}
              error={hasError('listing-pricing')}
            >
              {isWizard ? (
                <WizardStepHint>
                  {requiredAttributeLabels.length > 0
                    ? `Điền ${requiredAttributeLabels.join(', ')}; `
                    : ''}
                  giữ ít nhất một hình thức đặt và hoàn tất cấu hình đang bật.
                  {selectedType?.bookingSelection === 'fixed_packages'
                    ? ' Có thể lưu nháp chưa có gói; gói đã thêm phải đủ tên, thời lượng và giá.'
                    : inventoryOnly
                      ? ' Giá thuê và số lượng cho thuê phải lớn hơn 0.'
                      : ' Giá 0 vẫn được lưu nháp nhưng chưa đủ điều kiện gửi duyệt.'}
                </WizardStepHint>
              ) : null}
              <ListingConfig
                form={form}
                listingTypes={listingTypes}
                listing={listing}
                embedded
                validateOnChange={
                  wizard.attempted.has('listing-pricing') || wizard.completed.has('listing-pricing')
                }
              />
            </WizardSection>
          ),
          'listing-operations': (
            <WizardSection
              id="listing-operations"
              step={isWizard ? 4 : undefined}
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
                {isWizard ? (
                  <WizardStepHint required={false}>
                    Không cần thao tác nếu các giá trị mặc định phù hợp. Trường đã nhập phải là số
                    hợp lệ.
                  </WizardStepHint>
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
            </WizardSection>
          ),
          'listing-payment': (
            <WizardSection
              id="listing-payment"
              step={isWizard ? 5 : undefined}
              title="Thanh toán & kiểm tra"
              description="Kiểm tra tiền giữ chỗ và chính sách hủy trước khi lưu bản nháp."
              icon={<ShieldCheck aria-hidden />}
              complete={visualComplete('listing-payment')}
              error={hasError('listing-payment')}
            >
              <div className="space-y-6">
                {isWizard ? (
                  <WizardStepHint>
                    Có thể giữ hình thức thanh toán và chính sách mặc định. Tỷ lệ đặt cọc phải từ{' '}
                    {minimumDepositPercent ?? 0}% trở lên.
                  </WizardStepHint>
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
            </WizardSection>
          ),
        };

        const contextStrip = (
          <WizardContextStrip
            label="Loại dịch vụ"
            value={selectedType?.name ?? 'Chưa chọn'}
            context={groupId ? 'Hạng mục trong tin đăng' : 'Một hạng mục độc lập'}
            dirty={form.formState.isDirty}
          />
        );

        if (isWizard) {
          return (
            <FormWizard
              wizard={wizard}
              map={listingSectionMap}
              sections={sectionNodes}
              progress={progress}
              errors={form.formState.errors}
              busy={isSubmitting}
              validateStep={(id) => form.trigger(LISTING_STEP_FIELDS[id], { shouldFocus: true })}
              contextStrip={contextStrip}
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
              footerNote={
                groupId ? (
                  <p className="text-xs text-muted-foreground">
                    Cả hai lựa chọn bên dưới đều lưu hạng mục trước khi chuyển trang.
                  </p>
                ) : null
              }
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

                {listingSectionMap.sections.map((section) => (
                  <Fragment key={section.id}>{sectionNodes[section.id]}</Fragment>
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
              />
            </div>

            <FormRailMobileActions isSubmitting={isSubmitting} submitLabel={submitLabel} />
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
