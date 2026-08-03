import { createListingTypeInputSchema, type CreateListingTypeInput } from '@booking/contracts';
import type { Path } from '@booking/ui/components/form/rhf';
import {
  createFormProgress,
  type FormSectionDefinition,
  type FormSectionMap,
} from '~/lib/form-progress';

const SECTIONS = [
  {
    id: 'type-identity',
    label: 'Nhận diện loại dịch vụ',
    shortLabel: 'Nhận diện',
  },
  {
    id: 'type-structure',
    label: 'Cấu trúc và vận hành',
    shortLabel: 'Cấu trúc',
  },
  {
    id: 'type-booking',
    label: 'Cách khách đặt',
    shortLabel: 'Cách đặt',
  },
  {
    id: 'type-attributes',
    label: 'Thông tin riêng',
    shortLabel: 'Thông tin',
  },
  {
    id: 'type-search',
    label: 'Tìm kiếm trên storefront',
    shortLabel: 'Tìm kiếm',
  },
] as const satisfies ReadonlyArray<FormSectionDefinition<string>>;

export type ListingTypeFormSectionId = (typeof SECTIONS)[number]['id'];

const FIELD_SECTION: Record<string, ListingTypeFormSectionId> = {
  name: 'type-identity',
  icon: 'type-identity',
  iconImageUrl: 'type-identity',

  structure: 'type-structure',
  itemLabel: 'type-structure',
  sortOrder: 'type-structure',
  isActive: 'type-structure',
  requiresIdentityVerification: 'type-structure',

  bookingSelection: 'type-booking',
  allowedModes: 'type-booking',
  defaultModes: 'type-booking',

  attributeSchema: 'type-attributes',

  searchConfig: 'type-search',
};

/** The fields a wizard step re-validates before it lets the tenant continue. */
export const LISTING_TYPE_STEP_FIELDS: Record<
  ListingTypeFormSectionId,
  Path<CreateListingTypeInput>[]
> = {
  'type-identity': ['name', 'icon', 'iconImageUrl'],
  'type-structure': [
    'structure',
    'itemLabel',
    'sortOrder',
    'isActive',
    'requiresIdentityVerification',
  ],
  'type-booking': ['bookingSelection', 'allowedModes', 'defaultModes'],
  'type-attributes': ['attributeSchema'],
  'type-search': ['searchConfig'],
};

/**
 * The listing type form's sections and its field → section map. Stable across
 * renders, so the wizard controller can depend on it.
 */
export const listingTypeSectionMap: FormSectionMap<
  ListingTypeFormSectionId,
  CreateListingTypeInput
> = createFormProgress({
  sections: SECTIONS,
  fieldSection: FIELD_SECTION,
  schema: createListingTypeInputSchema,
});
