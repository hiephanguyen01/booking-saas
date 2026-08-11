import type { ListingTypeResponse, PublicListingTypeResponse } from '@booking/contracts';
import type { ListingTypeRecord } from '../domain/ports/listing-type-repository.port';

export function toListingTypeResponse(t: ListingTypeRecord): ListingTypeResponse {
  return {
    id: t.id,
    tenantId: t.tenantId,
    name: t.name,
    slug: t.slug,
    icon: t.icon,
    iconImageUrl: t.iconImageUrl,
    allowedModes: t.allowedModes,
    defaultModes: t.defaultModes,
    bookingSelection: t.bookingSelection,
    attributeSchema: t.attributeSchema,
    searchConfig: t.searchConfig,
    unitLabel: t.unitLabel,
    sortOrder: t.sortOrder,
    isActive: t.isActive,
    requiresIdentityVerification: t.requiresIdentityVerification,
    structure: t.structure,
    itemLabel: t.itemLabel,
    taxCategory: t.taxCategory,
    listingCount: t.listingCount,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

/** Menu shape — trims the schema to filterable fields (drives storefront filters). */
export function toPublicListingTypeResponse(t: ListingTypeRecord): PublicListingTypeResponse {
  return {
    id: t.id,
    name: t.name,
    slug: t.slug,
    icon: t.icon,
    iconImageUrl: t.iconImageUrl,
    unitLabel: t.unitLabel,
    sortOrder: t.sortOrder,
    requiresIdentityVerification: t.requiresIdentityVerification,
    structure: t.structure,
    itemLabel: t.itemLabel,
    allowedModes: t.allowedModes,
    defaultModes: t.defaultModes,
    bookingSelection: t.bookingSelection,
    attributeSchema: t.attributeSchema.filter((f) => f.filterable),
    searchConfig: t.searchConfig,
  };
}
