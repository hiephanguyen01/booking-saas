import {
  createListingInputSchema,
  type CancellationPolicyResponse,
  type ListingResponse,
  type ListingTypeResponse,
} from '@booking/contracts';
import { GenericForm } from '@booking/ui/components/form/generic-form';
import {
  BadgeDollarSign,
  FileText,
  MapPinned,
  Settings2,
  ShieldCheck,
} from 'lucide-react';
import { useNavigation } from 'react-router';
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
  useActiveListingFormSection,
} from './listing-form-layout';
import {
  getListingFormErrorSections,
  getListingFormProgress,
  type ListingFormSectionId,
} from './listing-form-progress';

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
}) {
  const isEdit = Boolean(listing);
  const submitLabel = isEdit ? 'Lưu thay đổi' : 'Tạo tin đăng';
  const navigation = useNavigation();
  const isSubmitting = navigation.state === 'submitting';
  const { activeSection, navigateToSection } = useActiveListingFormSection();

  return (
    <GenericForm
      schema={createListingInputSchema}
      fields={listingFormFields({
        listingTypes,
        isEdit,
        lockedListingTypeId,
        minimumDepositPercent,
      })}
      columns={2}
      defaultValues={listingFormDefaults({
        partnerId,
        listingTypes,
        listing,
        groupId,
        lockedListingTypeId,
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
        const hasError = (id: ListingFormSectionId) => errorSections.has(id);

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

                <ListingFormSection
                  id="listing-content"
                  step={1}
                  title="Nội dung & đặc điểm"
                  description="Thông tin đầu tiên khách nhìn thấy khi tìm và so sánh dịch vụ."
                  icon={<FileText aria-hidden />}
                  complete={complete('listing-content')}
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

                <ListingFormSection
                  id="listing-location"
                  step={2}
                  title="Địa điểm"
                  description="Địa chỉ được hiển thị cho khách và dùng để xác định khu vực hoạt động."
                  icon={<MapPinned aria-hidden />}
                  complete={complete('listing-location')}
                  error={hasError('listing-location')}
                >
                  <AdministrativeAddressFields form={form} embedded />
                </ListingFormSection>

                <ListingFormSection
                  id="listing-pricing"
                  step={3}
                  title="Dịch vụ & giá"
                  description="Mô tả đặc điểm hạng mục, chọn cách đặt chỗ và cấu hình mức giá tương ứng."
                  icon={<BadgeDollarSign aria-hidden />}
                  complete={complete('listing-pricing')}
                  error={hasError('listing-pricing')}
                >
                  <div className="space-y-4">
                    <ListingConfig
                      form={form}
                      listingTypes={listingTypes}
                      listing={listing}
                      embedded
                    />
                  </div>
                </ListingFormSection>

                <ListingFormSection
                  id="listing-operations"
                  step={4}
                  title="Vận hành"
                  description="Thiết lập sức chứa, khoảng nghỉ và quy trình duyệt trước khi thanh toán."
                  icon={<Settings2 aria-hidden />}
                  complete={complete('listing-operations')}
                  error={hasError('listing-operations')}
                >
                  <div className="space-y-4">
                    <Grid>
                      {fieldNode(renderedFields, 'capacity')}
                      {fieldNode(renderedFields, 'bufferBefore')}
                      {fieldNode(renderedFields, 'bufferAfter')}
                    </Grid>
                    {fieldNode(renderedFields, 'approvalRequired')}
                  </div>
                </ListingFormSection>

                <ListingFormSection
                  id="listing-payment"
                  step={5}
                  title="Thanh toán & chính sách"
                  description="Quy định số tiền giữ chỗ và các mốc hoàn tiền khách sẽ thấy trước khi đặt."
                  icon={<ShieldCheck aria-hidden />}
                  complete={complete('listing-payment')}
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
      })}
    />
  );
}
