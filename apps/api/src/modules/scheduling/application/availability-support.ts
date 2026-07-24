import type { PrismaTx } from '../../../shared/tenant-context/tenant-db.service';
import type { IListingRepository } from '../../listing/domain/ports/listing-repository.port';
import type { IResourceRepository } from '../../listing/domain/ports/resource-repository.port';
import { ListingNotFound, ResourceNotFound } from '../../listing/domain/errors/listing-errors';
import {
  ListingNotOwnedForAvailability,
  ResourceNotOwnedForAvailability,
} from '../domain/errors/availability-errors';

/** Tenant/partner context. `partnerId` set → the target must be the partner's own. */
export interface ManageContext {
  tenantId: string;
  partnerId?: string;
}

/**
 * Load a listing and assert it exists and — on partner-scoped calls — is the
 * partner's own. Shared by every availability-management use case that targets
 * a listing so they all answer identically (404 / 403).
 */
export async function assertListing(
  listings: IListingRepository,
  tx: PrismaTx,
  listingId: string,
  partnerId?: string,
): Promise<{ resourceId: string }> {
  const listing = await listings.findById(tx, listingId);
  if (!listing) {
    throw new ListingNotFound();
  }
  if (partnerId && listing.partnerId !== partnerId) {
    throw new ListingNotOwnedForAvailability();
  }
  return { resourceId: listing.resourceId };
}

/**
 * Assert a resource exists and — on partner-scoped calls — is the partner's
 * own. Shared by every availability-management use case that targets a resource.
 */
export async function assertResource(
  resources: IResourceRepository,
  tx: PrismaTx,
  resourceId: string,
  partnerId?: string,
): Promise<void> {
  const resource = await resources.findById(tx, resourceId);
  if (!resource) {
    throw new ResourceNotFound();
  }
  if (partnerId && resource.partnerId !== partnerId) {
    throw new ResourceNotOwnedForAvailability();
  }
}
