import {
  createListingInputSchema,
  type CancellationPolicySummary,
  type ListingResponse,
  type ListingTypeResponse,
} from '@booking/contracts';
import { GenericForm } from '@booking/ui/components/form/generic-form';
import { AdministrativeAddressFields } from './administrative-address-fields';
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
  cancellationPolicies?: CancellationPolicySummary[];
  minimumDepositPercent?: number | null;
}) {
  const isEdit = Boolean(listing);

  return (
    <GenericForm
      schema={createListingInputSchema}
      fields={listingFormFields({
        listingTypes,
        cancellationPolicies,
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
      extraFields={(form) => (
        <div className="space-y-6">
          <AdministrativeAddressFields form={form} />
          <ListingConfig form={form} listingTypes={listingTypes} listing={listing} />
        </div>
      )}
      transform={(d) => ({
        ...d,
        description: d.description?.trim() || undefined,
        address: d.address.trim(),
        photos: (d.photos ?? []).filter(Boolean),
      })}
    />
  );
}
