import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import {
  LISTING_GROUP_REPOSITORY,
  type IListingGroupRepository,
} from '../../domain/ports/listing-group-repository.port';

/** Delete a group; blocked while it still contains listings. */
@Injectable()
export class DeleteListingGroupUseCase {
  constructor(
    @Inject(LISTING_GROUP_REPOSITORY) private readonly repo: IListingGroupRepository,
    private readonly tenantDb: TenantDbService,
    private readonly outbox: OutboxService,
  ) {}

  async execute(
    tenantId: string,
    id: string,
    options: { requirePartnerId?: string } = {},
  ): Promise<void> {
    await this.tenantDb.forTenant(tenantId, async (tx) => {
      const existing = await this.repo.findById(tx, id);
      if (!existing) {
        throw new NotFoundException({
          statusCode: 404,
          code: 'LISTING_GROUP_NOT_FOUND',
          message: 'Listing group not found',
        });
      }
      if (options.requirePartnerId && existing.partnerId !== options.requirePartnerId) {
        throw new ForbiddenException({
          statusCode: 403,
          code: 'LISTING_GROUP_NOT_OWNED',
          message: 'Listing group belongs to another partner',
        });
      }
      const count = await this.repo.countListings(tx, id);
      if (count > 0) {
        throw new ConflictException({
          statusCode: 409,
          code: 'LISTING_GROUP_NOT_EMPTY',
          message: `Cannot delete a group with ${count} listing(s)`,
        });
      }
      await this.repo.delete(tx, id);
      await this.outbox.emit(tx, {
        tenantId,
        eventType: 'listing_group.deleted',
        payload: { listingGroupId: id },
      });
    });
  }
}
