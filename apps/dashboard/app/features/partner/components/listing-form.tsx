import {
  createListingInputSchema,
  type CancellationPolicyResponse,
  type ListingResponse,
  type ListingTypeResponse,
} from '@booking/contracts';
import { GenericForm } from '@booking/ui/components/form/generic-form';
import { fieldNode, FormSurface, Grid, Section } from '~/components/form-layout';
import { AdministrativeAddressFields } from './administrative-address-fields';
import { ListingCancellationPolicyField } from './listing-cancellation-policy-field';
import { ListingConfig } from './listing-config';
import { listingFormDefaults, listingFormFields } from './listing-form-fields';

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
      submitLabel={isEdit ? 'Lưu thay đổi' : 'Tạo tin đăng'}
      serverError={serverError}
      fieldErrors={fieldErrors}
      className="w-full space-y-4"
      actionsClassName="justify-end border-t pt-4"
      warnOnUnsavedChanges
      renderFields={(renderedFields, values, form) => {
        const selectedType =
          listingTypes.find((type) => type.id === values.listingTypeId) ?? listingTypes[0];

        return (
          <FormSurface>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/20 px-5 py-4 md:px-7">
              <div>
                <p className="text-xs text-muted-foreground">Loại dịch vụ</p>
                <p className="text-sm font-medium">
                  {selectedType?.name ?? 'Chưa chọn'} ·{' '}
                  {groupId ? 'Hạng mục trong tin đăng' : 'Một hạng mục'}
                </p>
              </div>
              <p className="text-xs text-muted-foreground">Đường dẫn được tạo tự động khi lưu</p>
            </div>
            <Section title="Thông tin cơ bản" description="Tên, mô tả và hình ảnh khách sẽ thấy.">
              {fieldNode(renderedFields, 'listingTypeId')}
              {fieldNode(renderedFields, 'title')}
              {fieldNode(renderedFields, 'description')}
              {fieldNode(renderedFields, 'photos')}
            </Section>

            <AdministrativeAddressFields form={form} />

            <ListingConfig form={form} listingTypes={listingTypes} listing={listing} />

            <Section
              title="Quy định số khách và vận hành"
              description="Thiết lập sức chứa và khoảng nghỉ cần thiết giữa hai lượt đặt."
            >
              <Grid>
                {fieldNode(renderedFields, 'capacity')}
                {fieldNode(renderedFields, 'bufferBefore')}
                {fieldNode(renderedFields, 'bufferAfter')}
              </Grid>
              {fieldNode(renderedFields, 'approvalRequired')}
            </Section>

            <Section
              title="Thanh toán"
              description="Quy định số tiền khách cần thanh toán để giữ chỗ."
            >
              <Grid>
                {fieldNode(renderedFields, 'depositPercent')}
                {fieldNode(renderedFields, 'balanceDue')}
              </Grid>
            </Section>

            <ListingCancellationPolicyField form={form} policies={cancellationPolicies} />
          </FormSurface>
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
