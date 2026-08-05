import { createListingGroupInputSchema, type CreateListingGroupInput } from '@booking/contracts';
import type { Path } from '@booking/ui/components/form/rhf';
import {
  createFormProgress,
  type FormSectionDefinition,
  type FormSectionMap,
} from '~/lib/form-progress';

const SECTIONS = [
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
] as const satisfies ReadonlyArray<FormSectionDefinition<string>>;

export type ListingGroupFormSectionId = (typeof SECTIONS)[number]['id'];

const FIELD_SECTION: Record<string, ListingGroupFormSectionId> = {
  partnerId: 'group-content',
  listingTypeId: 'group-content',
  title: 'group-content',
  slug: 'group-content',
  description: 'group-content',
  photos: 'group-content',
  amenities: 'group-content',

  provinceCode: 'group-location',
  wardCode: 'group-location',
  address: 'group-location',
  latitude: 'group-location',
  longitude: 'group-location',
  workingArea: 'group-location',
};

/** The fields a wizard step re-validates before it lets the partner continue. */
export const LISTING_GROUP_STEP_FIELDS: Record<
  ListingGroupFormSectionId,
  Path<CreateListingGroupInput>[]
> = {
  'group-content': ['title', 'description', 'photos', 'amenities'],
  'group-location': ['provinceCode', 'wardCode', 'address', 'latitude', 'longitude'],
};

/**
 * The listing group form's sections and its field → section map. Stable across
 * renders, so the wizard controller can depend on it.
 */
export const listingGroupSectionMap: FormSectionMap<
  ListingGroupFormSectionId,
  CreateListingGroupInput
> = createFormProgress({
  sections: SECTIONS,
  fieldSection: FIELD_SECTION,
  schema: createListingGroupInputSchema,
});
