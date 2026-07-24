import type {
  AttributeField,
  BookingMode,
  ListingTypeSearchAttributeFacet,
  ListingTypeSearchConfig,
} from '@booking/contracts';
import {
  InvalidSearchBuckets,
  InvalidSearchFacet,
  InvalidSearchSchedule,
} from './errors/listing-type-errors';

const CONTROL_BY_TYPE: Record<
  AttributeField['type'],
  Set<ListingTypeSearchAttributeFacet['control']>
> = {
  boolean: new Set(['checkbox', 'radio']),
  select: new Set(['checkbox', 'radio']),
  multiselect: new Set(['checkbox']),
  number: new Set(['range', 'buckets']),
  text: new Set(['checkbox', 'radio']),
};

function bucketsOverlap(
  left: NonNullable<ListingTypeSearchAttributeFacet['buckets']>[number],
  right: NonNullable<ListingTypeSearchAttributeFacet['buckets']>[number],
): boolean {
  const leftMin = left.min ?? Number.NEGATIVE_INFINITY;
  const leftMax = left.max ?? Number.POSITIVE_INFINITY;
  const rightMin = right.min ?? Number.NEGATIVE_INFINITY;
  const rightMax = right.max ?? Number.POSITIVE_INFINITY;
  return leftMin < rightMax && rightMin < leftMax;
}

/** Validate search settings against the merged listing-type state before persistence. */
export function assertValidListingTypeSearchConfig(input: {
  allowedModes: BookingMode[];
  attributeSchema: AttributeField[];
  searchConfig: ListingTypeSearchConfig;
}): void {
  const { allowedModes, attributeSchema, searchConfig } = input;
  if (searchConfig.schedule !== 'none' && !allowedModes.includes(searchConfig.schedule)) {
    throw new InvalidSearchSchedule(searchConfig.schedule);
  }

  const fields = new Map(attributeSchema.map((field) => [field.key, field]));
  for (const facet of searchConfig.attributeFacets) {
    const field = fields.get(facet.key);
    if (!field?.filterable) {
      throw new InvalidSearchFacet(
        `Search facet "${facet.key}" must reference a filterable attribute`,
      );
    }
    if (!CONTROL_BY_TYPE[field.type].has(facet.control)) {
      throw new InvalidSearchFacet(
        `Control "${facet.control}" is not supported for ${field.type} attribute "${facet.key}"`,
      );
    }
    if (facet.matchAll && (field.type !== 'multiselect' || facet.control !== 'checkbox')) {
      throw new InvalidSearchFacet(
        `matchAll is only supported for multiselect checkbox facet "${facet.key}"`,
      );
    }
    if (facet.control !== 'buckets') continue;
    const buckets = facet.buckets ?? [];
    for (let left = 0; left < buckets.length; left += 1) {
      for (let right = left + 1; right < buckets.length; right += 1) {
        if (bucketsOverlap(buckets[left]!, buckets[right]!)) {
          throw new InvalidSearchBuckets(buckets[left]!.id, buckets[right]!.id, facet.key);
        }
      }
    }
  }
}
