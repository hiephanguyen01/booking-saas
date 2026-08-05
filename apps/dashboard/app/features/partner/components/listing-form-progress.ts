import { createListingInputSchema, type CreateListingInput } from '@booking/contracts';
import type { Path } from '@booking/ui/components/form/rhf';
import {
  createFormProgress,
  type FormProgress,
  type FormSectionDefinition,
  type FormSectionMap,
} from '~/lib/form-progress';

const SECTIONS = [
  {
    id: 'listing-content',
    label: 'Nội dung & đặc điểm',
    shortLabel: 'Nội dung',
  },
  {
    id: 'listing-location',
    label: 'Địa điểm',
    shortLabel: 'Địa điểm',
  },
  {
    id: 'listing-pricing',
    label: 'Dịch vụ & giá',
    shortLabel: 'Giá',
  },
  {
    id: 'listing-operations',
    label: 'Vận hành',
    shortLabel: 'Vận hành',
  },
  {
    id: 'listing-payment',
    label: 'Thanh toán & chính sách',
    shortLabel: 'Thanh toán',
  },
] as const satisfies ReadonlyArray<FormSectionDefinition<string>>;

export type ListingFormSectionId = (typeof SECTIONS)[number]['id'];

export type ListingFormProgress = FormProgress<ListingFormSectionId>;

const FIELD_SECTION: Record<string, ListingFormSectionId> = {
  partnerId: 'listing-content',
  listingTypeId: 'listing-content',
  groupId: 'listing-content',
  categoryId: 'listing-content',
  resourceId: 'listing-content',
  title: 'listing-content',
  slug: 'listing-content',
  description: 'listing-content',
  photos: 'listing-content',

  provinceCode: 'listing-location',
  wardCode: 'listing-location',
  address: 'listing-location',
  latitude: 'listing-location',
  longitude: 'listing-location',

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

/** The fields a wizard step re-validates before it lets the partner continue. */
export const LISTING_STEP_FIELDS: Record<ListingFormSectionId, Path<CreateListingInput>[]> = {
  'listing-content': ['title', 'description', 'photos'],
  'listing-location': ['provinceCode', 'wardCode', 'address', 'latitude', 'longitude'],
  'listing-pricing': ['bookingModes', 'modeConfig', 'stockQuantity', 'attributes'],
  'listing-operations': ['capacity', 'bufferBefore', 'bufferAfter', 'approvalRequired'],
  'listing-payment': ['depositPercent', 'balanceDue', 'cancellationPolicyId'],
};

interface ListingProgressSchema {
  safeParse: (values: unknown) => {
    success: boolean;
    error?: { issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey> }> };
  };
}

const mapFor = (schema: ListingProgressSchema) =>
  createFormProgress<ListingFormSectionId, CreateListingInput>({
    sections: SECTIONS,
    fieldSection: FIELD_SECTION,
    schema,
  });

/**
 * The listing form's sections and its field → section map. Stable across
 * renders, so the wizard controller can depend on it.
 */
export const listingSectionMap: FormSectionMap<ListingFormSectionId, CreateListingInput> =
  mapFor(createListingInputSchema);

/**
 * Derive completion from the same contract used for submission. The create
 * form passes its `superRefine`d schema so attribute and deposit rules count
 * towards a section being complete.
 */
export function getListingFormProgress(
  values: CreateListingInput,
  schema: ListingProgressSchema = createListingInputSchema,
): ListingFormProgress {
  return schema === createListingInputSchema
    ? listingSectionMap.getProgress(values)
    : mapFor(schema).getProgress(values);
}
