import { createListingInputSchema, type CreateListingInput } from '@booking/contracts';
import {
  createFormProgress,
  type FormProgress,
  type FormProgressItem,
  type FormSectionDefinition,
} from '~/features/partner/lib/form-progress';

export const LISTING_FORM_SECTIONS = [
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

export type ListingFormSectionId = (typeof LISTING_FORM_SECTIONS)[number]['id'];

export type ListingFormProgressItem = FormProgressItem<ListingFormSectionId>;
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

const progress = createFormProgress<ListingFormSectionId, CreateListingInput>({
  sections: LISTING_FORM_SECTIONS,
  fieldSection: FIELD_SECTION,
  schema: createListingInputSchema,
});

/** Derive completion from the same contract used for submission. */
export const getListingFormProgress = progress.getProgress;

/** Map RHF/server field errors to the same five visual sections. */
export const getListingFormErrorSections = progress.getErrorSections;
