import type {
  AttributeField,
  BookingMode,
  BookingSelection,
  ListingStructure,
  TenantTaxCategory,
  ListingTypeSearchConfig,
} from '@booking/contracts';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type { ListingTypePatch, NewListingType } from '../entities/listing-type.entity';

export const LISTING_TYPE_REPOSITORY = Symbol('LISTING_TYPE_REPOSITORY');

export interface ListingTypeRecord {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  icon: string | null;
  iconImageUrl: string | null;
  allowedModes: BookingMode[];
  defaultModes: BookingMode[];
  bookingSelection: BookingSelection;
  attributeSchema: AttributeField[];
  searchConfig: ListingTypeSearchConfig;
  unitLabel: string | null;
  sortOrder: number;
  isActive: boolean;
  requiresIdentityVerification: boolean;
  structure: ListingStructure;
  itemLabel: string | null;
  /** VAT treatment of everything sold under this type (§VAT). */
  taxCategory: TenantTaxCategory;
  /** Listings currently using this type (a type in use cannot be deleted). */
  listingCount: number;
  createdAt: Date;
  updatedAt: Date;
}

/** Listing types are tenant-scoped (RLS): every method runs inside `forTenant`. */
export interface IListingTypeRepository {
  create(tx: PrismaTx, tenantId: string, data: NewListingType): Promise<ListingTypeRecord>;
  findById(tx: PrismaTx, id: string): Promise<ListingTypeRecord | null>;
  findBySlug(tx: PrismaTx, slug: string): Promise<ListingTypeRecord | null>;
  list(tx: PrismaTx, opts: { includeInactive: boolean; q?: string }): Promise<ListingTypeRecord[]>;
  listActive(tx: PrismaTx): Promise<ListingTypeRecord[]>;
  update(tx: PrismaTx, id: string, patch: ListingTypePatch): Promise<ListingTypeRecord>;
  delete(tx: PrismaTx, id: string): Promise<void>;
  countListingsOfType(tx: PrismaTx, listingTypeId: string): Promise<number>;
}
