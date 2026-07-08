import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { UpdateListingGroupInput } from '@booking/shared';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import {
  LISTING_GROUP_REPOSITORY,
  type IListingGroupRepository,
  type ListingGroupRecord,
} from '../../domain/ports/listing-group-repository.port';

@Injectable()
export class UpdateListingGroupUseCase {
  constructor(
    @Inject(LISTING_GROUP_REPOSITORY) private readonly repo: IListingGroupRepository,
    private readonly tenantDb: TenantDbService,
    private readonly outbox: OutboxService,
  ) {}

  async execute(
    tenantId: string,
    id: string,
    input: UpdateListingGroupInput,
  ): Promise<ListingGroupRecord> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const existing = await this.repo.findById(tx, id);
      if (!existing) {
        throw new NotFoundException({
          statusCode: 404,
          code: 'LISTING_GROUP_NOT_FOUND',
          message: 'Listing group not found',
        });
      }
      if (input.slug && input.slug !== existing.slug) {
        const other = await this.repo.findBySlug(tx, input.slug);
        if (other && other.id !== id) {
          throw new ConflictException({
            statusCode: 409,
            code: 'LISTING_GROUP_SLUG_TAKEN',
            message: `Slug "${input.slug}" is already in use`,
          });
        }
      }
      const updated = await this.repo.update(tx, id, {
        partnerId: input.partnerId,
        listingTypeId: input.listingTypeId,
        title: input.title,
        slug: input.slug,
        description: input.description,
        address: input.address,
        workingArea: input.workingArea,
        amenities: input.amenities,
        photos: input.photos,
      });
      await this.outbox.emit(tx, {
        tenantId,
        eventType: 'listing_group.updated',
        payload: { listingGroupId: id },
      });
      return updated;
    });
  }
}
