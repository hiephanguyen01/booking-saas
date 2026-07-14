import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import {
  LISTING_REPOSITORY,
  type IListingRepository,
} from '../../domain/ports/listing-repository.port';
import {
  LISTING_GROUP_REPOSITORY,
  type IListingGroupRepository,
} from '../../domain/ports/listing-group-repository.port';

/** Delete a listing; blocked while it has bookings (§7.3 — no orphaned bookings). */
@Injectable()
export class DeleteListingUseCase {
  constructor(
    @Inject(LISTING_REPOSITORY) private readonly listings: IListingRepository,
    @Inject(LISTING_GROUP_REPOSITORY) private readonly groups: IListingGroupRepository,
    private readonly tenantDb: TenantDbService,
    private readonly outbox: OutboxService,
  ) {}

  async execute(tenantId: string, id: string, options: { requirePartnerId?: string } = {}): Promise<void> {
    await this.tenantDb.forTenant(tenantId, async (tx) => {
      const existing = await this.listings.findById(tx, id);
      if (!existing) {
        throw new NotFoundException({
          statusCode: 404,
          code: 'LISTING_NOT_FOUND',
          message: 'Listing not found',
        });
      }
      if (options.requirePartnerId && existing.partnerId !== options.requirePartnerId) {
        throw new ForbiddenException({ statusCode: 403, code: 'LISTING_NOT_OWNED', message: 'Listing belongs to another partner' });
      }
      if (options.requirePartnerId && existing.groupId) {
        const group = await this.groups.findById(tx, existing.groupId);
        if (!group || group.status !== 'draft') {
          throw new ConflictException({
            statusCode: 409,
            code: 'LISTING_GROUP_READ_ONLY',
            message: 'Hide the listing group before deleting its items',
          });
        }
      }
      const bookings = await this.listings.countBookings(tx, id);
      if (bookings > 0) {
        throw new ConflictException({
          statusCode: 409,
          code: 'LISTING_HAS_BOOKINGS',
          message: `Cannot delete a listing with ${bookings} booking(s)`,
        });
      }
      await this.listings.delete(tx, id);
      await this.outbox.emit(tx, {
        tenantId,
        eventType: 'listing.deleted',
        payload: { listingId: id },
      });
    });
  }
}
