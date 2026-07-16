import type { AttributeField, BookingMode, ListingStructure } from '@booking/contracts';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';

export const LISTING_TYPE_REPOSITORY = Symbol('LISTING_TYPE_REPOSITORY');

export interface ListingTypeRecord {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  icon: string | null;
  allowedModes: BookingMode[];
  defaultModes: BookingMode[];
  attributeSchema: AttributeField[];
  unitLabel: string | null;
  sortOrder: number;
  isActive: boolean;
  requiresIdentityVerification: boolean;
  structure: ListingStructure;
  itemLabel: string | null;
  /** Listings currently using this type (a type in use cannot be deleted). */
  listingCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateListingTypeData {
  name: string;
  slug: string;
  icon: string | null;
  allowedModes: BookingMode[];
  defaultModes: BookingMode[];
  attributeSchema: AttributeField[];
  unitLabel: string | null;
  sortOrder: number;
  isActive: boolean;
  requiresIdentityVerification: boolean;
  structure: ListingStructure;
  itemLabel: string | null;
}

export type UpdateListingTypeData = Partial<CreateListingTypeData>;

/** Listing types are tenant-scoped (RLS): every method runs inside `forTenant`. */
export interface IListingTypeRepository {
  create(tx: PrismaTx, tenantId: string, data: CreateListingTypeData): Promise<ListingTypeRecord>;
  findById(tx: PrismaTx, id: string): Promise<ListingTypeRecord | null>;
  findBySlug(tx: PrismaTx, slug: string): Promise<ListingTypeRecord | null>;
  list(tx: PrismaTx, opts: { includeInactive: boolean }): Promise<ListingTypeRecord[]>;
  listActive(tx: PrismaTx): Promise<ListingTypeRecord[]>;
  update(tx: PrismaTx, id: string, data: UpdateListingTypeData): Promise<ListingTypeRecord>;
  delete(tx: PrismaTx, id: string): Promise<void>;
  countListingsOfType(tx: PrismaTx, listingTypeId: string): Promise<number>;
}
