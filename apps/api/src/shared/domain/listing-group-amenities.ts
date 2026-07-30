import { listingGroupAmenitySchema, type ListingGroupAmenity } from '@booking/contracts';

/**
 * Stored listing-group amenities predate their icon-bearing shape. Keep the
 * compatibility conversion at the persistence/query boundary so every
 * application mapper receives one canonical representation.
 */
export function normalizeListingGroupAmenities(raw: unknown): ListingGroupAmenity[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    const parsed = listingGroupAmenitySchema.safeParse(item);
    if (parsed.success) return [parsed.data];
    if (typeof item === 'string' && item.trim()) {
      return [{ label: item.trim(), icon: 'Check' as const }];
    }
    return [];
  });
}

export function listingGroupAmenityLabels(raw: unknown): string[] {
  return normalizeListingGroupAmenities(raw).map((amenity) => amenity.label);
}
