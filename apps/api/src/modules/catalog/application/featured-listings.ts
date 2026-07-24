import type { PublicListingRecord } from '../domain/ports/listing-read-repository.port';

export const MAX_FEATURED_LISTINGS = 24;
export const GROUP_OVERFETCH_FACTOR = 3;

export function featuredListingLimit(requestedLimit: number): number {
  return Math.max(1, Math.min(MAX_FEATURED_LISTINGS, requestedLimit));
}

export function uniquePublicListingRecords(
  records: PublicListingRecord[],
  limit: number,
): PublicListingRecord[] {
  const unique: PublicListingRecord[] = [];
  const seen = new Set<string>();
  for (const record of records) {
    const key = record.group?.id ?? record.id;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(record);
    if (unique.length >= limit) break;
  }
  return unique;
}
