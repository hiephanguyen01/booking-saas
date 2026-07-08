import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';

export const LISTING_READ_REPOSITORY = Symbol('LISTING_READ_REPOSITORY');

export interface PublicListingRecord {
  id: string;
  title: string;
  slug: string;
  listingTypeSlug: string;
  attributes: Record<string, unknown>;
  photos: unknown[];
  modeConfig: Record<string, unknown>;
}

export interface PublicListingFilter {
  typeSlug?: string;
  category?: string;
  q?: string;
  /** Dynamic `attr.<key>=<value>` equality filters parsed from the query string. */
  attrFilters: Record<string, string>;
}

/** Read-only storefront listing queries (published only). Listing CRUD is Task 1.4. */
export interface IListingReadRepository {
  findPublished(tx: PrismaTx, filter: PublicListingFilter): Promise<PublicListingRecord[]>;
}
