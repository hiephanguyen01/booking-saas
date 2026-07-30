import {
  createListingInputSchema,
  type CreateListingInput,
} from '@booking/contracts';

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
] as const;

export type ListingFormSectionId = (typeof LISTING_FORM_SECTIONS)[number]['id'];

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

export interface ListingFormProgressItem {
  id: ListingFormSectionId;
  label: string;
  shortLabel: string;
  complete: boolean;
}

export interface ListingFormProgress {
  percentage: number;
  completedCount: number;
  items: ListingFormProgressItem[];
}

/**
 * Derive completion from the same contract used for submission. Optional fields
 * do not produce Zod issues, so they never reduce the save-readiness score.
 */
export function getListingFormProgress(values: CreateListingInput): ListingFormProgress {
  const invalidSections = new Set<ListingFormSectionId>();
  const result = createListingInputSchema.safeParse(values);

  if (!result.success) {
    for (const issue of result.error.issues) {
      const field = String(issue.path[0] ?? '');
      const section = FIELD_SECTION[field];
      if (section) invalidSections.add(section);
    }
  }

  const items = LISTING_FORM_SECTIONS.map((section) => ({
    ...section,
    complete: !invalidSections.has(section.id),
  }));
  const completedCount = items.filter((item) => item.complete).length;

  return {
    items,
    completedCount,
    percentage: Math.round((completedCount / items.length) * 100),
  };
}

/** Map RHF/server field errors to the same five visual sections. */
export function getListingFormErrorSections(errors: unknown): Set<ListingFormSectionId> {
  const sections = new Set<ListingFormSectionId>();
  if (!errors || typeof errors !== 'object') return sections;

  for (const field of Object.keys(errors)) {
    const section = FIELD_SECTION[field];
    if (section) sections.add(section);
  }
  return sections;
}
