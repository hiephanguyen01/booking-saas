import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { PrismaTx } from '../../../shared/tenant-context/tenant-db.service';
import type { IListingRepository } from '../../listing/domain/ports/listing-repository.port';
import type { IResourceRepository } from '../../listing/domain/ports/resource-repository.port';

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
    throw new NotFoundException({ statusCode: 404, code: 'LISTING_NOT_FOUND', message: 'Listing not found' });
  }
  if (partnerId && listing.partnerId !== partnerId) {
    throw new ForbiddenException({ statusCode: 403, code: 'NOT_OWNED', message: 'Listing belongs to another partner' });
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
    throw new NotFoundException({ statusCode: 404, code: 'RESOURCE_NOT_FOUND', message: 'Resource not found' });
  }
  if (partnerId && resource.partnerId !== partnerId) {
    throw new ForbiddenException({ statusCode: 403, code: 'NOT_OWNED', message: 'Resource belongs to another partner' });
  }
}
