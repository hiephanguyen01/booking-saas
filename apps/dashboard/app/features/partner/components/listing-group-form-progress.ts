import { createListingGroupInputSchema, type CreateListingGroupInput } from '@booking/contracts';
import {
  createFormProgress,
  type FormProgress,
  type FormSectionDefinition,
} from '~/features/partner/lib/form-progress';

export const LISTING_GROUP_FORM_SECTIONS = [
  {
    id: 'group-content',
    label: 'Nội dung & ảnh',
    shortLabel: 'Nội dung',
  },
  {
    id: 'group-location',
    label: 'Địa điểm',
    shortLabel: 'Địa điểm',
  },
  {
    id: 'group-amenities',
    label: 'Tiện ích chung',
    shortLabel: 'Tiện ích',
  },
] as const satisfies ReadonlyArray<FormSectionDefinition<string>>;

export type ListingGroupFormSectionId = (typeof LISTING_GROUP_FORM_SECTIONS)[number]['id'];

export type ListingGroupFormProgress = FormProgress<ListingGroupFormSectionId>;

const FIELD_SECTION: Record<string, ListingGroupFormSectionId> = {
  partnerId: 'group-content',
  listingTypeId: 'group-content',
  title: 'group-content',
  slug: 'group-content',
  description: 'group-content',
  photos: 'group-content',

  provinceCode: 'group-location',
  wardCode: 'group-location',
  address: 'group-location',
  workingArea: 'group-location',

  amenities: 'group-amenities',
};

const progress = createFormProgress<ListingGroupFormSectionId, CreateListingGroupInput>({
  sections: LISTING_GROUP_FORM_SECTIONS,
  fieldSection: FIELD_SECTION,
  schema: createListingGroupInputSchema,
});

/** Derive completion from the same contract used for submission. */
export const getListingGroupFormProgress = progress.getProgress;

/** Map RHF/server field errors to the same three visual sections. */
export const getListingGroupFormErrorSections = progress.getErrorSections;
