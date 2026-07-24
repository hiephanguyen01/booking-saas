export const DEFAULT_FEATURED_LISTINGS_PAGE_SIZE = 18;
export const MAX_FEATURED_LISTINGS_PAGE_SIZE = 24;

export function featuredListingsPageSize(value: string | number | null | undefined): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return DEFAULT_FEATURED_LISTINGS_PAGE_SIZE;
  return Math.min(parsed, MAX_FEATURED_LISTINGS_PAGE_SIZE);
}
