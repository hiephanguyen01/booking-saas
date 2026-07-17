import { BadRequestException } from '@nestjs/common';
import type {
  AttributeField,
  BookingMode,
  ListingTypeSearchAttributeFacet,
  ListingTypeSearchConfig,
} from '@booking/contracts';

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

function invalid(code: string, message: string): never {
  throw new BadRequestException({ statusCode: 400, code, message });
}

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
    invalid(
      'INVALID_SEARCH_SCHEDULE',
      `Search schedule "${searchConfig.schedule}" must be enabled by allowedModes`,
    );
  }

  const fields = new Map(attributeSchema.map((field) => [field.key, field]));
  for (const facet of searchConfig.attributeFacets) {
    const field = fields.get(facet.key);
    if (!field?.filterable) {
      invalid(
        'INVALID_SEARCH_FACET',
        `Search facet "${facet.key}" must reference a filterable attribute`,
      );
    }
    if (!CONTROL_BY_TYPE[field.type].has(facet.control)) {
      invalid(
        'INVALID_SEARCH_FACET',
        `Control "${facet.control}" is not supported for ${field.type} attribute "${facet.key}"`,
      );
    }
    if (facet.matchAll && (field.type !== 'multiselect' || facet.control !== 'checkbox')) {
      invalid(
        'INVALID_SEARCH_FACET',
        `matchAll is only supported for multiselect checkbox facet "${facet.key}"`,
      );
    }
    if (facet.control !== 'buckets') continue;
    const buckets = facet.buckets ?? [];
    for (let left = 0; left < buckets.length; left += 1) {
      for (let right = left + 1; right < buckets.length; right += 1) {
        if (bucketsOverlap(buckets[left]!, buckets[right]!)) {
          invalid(
            'INVALID_SEARCH_BUCKETS',
            `Buckets "${buckets[left]!.id}" and "${buckets[right]!.id}" overlap in facet "${facet.key}"`,
          );
        }
      }
    }
  }
}
