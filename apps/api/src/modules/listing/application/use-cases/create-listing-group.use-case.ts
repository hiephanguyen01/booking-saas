import { ConflictException, Inject, Injectable } from '@nestjs/common';
import type { CreateListingGroupInput } from '@booking/shared';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import {
  LISTING_GROUP_REPOSITORY,
  type IListingGroupRepository,
  type ListingGroupRecord,
} from '../../domain/ports/listing-group-repository.port';

/** Two-tier post: a group (album/amenities/address) that holds room/package listings (§7.3). */
@Injectable()
export class CreateListingGroupUseCase {
  constructor(
    @Inject(LISTING_GROUP_REPOSITORY) private readonly repo: IListingGroupRepository,
    private readonly tenantDb: TenantDbService,
    private readonly outbox: OutboxService,
  ) {}

  async execute(tenantId: string, input: CreateListingGroupInput): Promise<ListingGroupRecord> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      if (await this.repo.findBySlug(tx, input.slug)) {
        throw new ConflictException({
          statusCode: 409,
          code: 'LISTING_GROUP_SLUG_TAKEN',
          message: `Slug "${input.slug}" is already in use`,
        });
      }
      const created = await this.repo.create(tx, tenantId, {
        partnerId: input.partnerId,
        listingTypeId: input.listingTypeId,
        title: input.title,
        slug: input.slug,
        description: input.description ?? null,
        address: input.address ?? null,
        workingArea: input.workingArea ?? null,
        amenities: input.amenities,
        photos: input.photos,
      });
      await this.outbox.emit(tx, {
        tenantId,
        eventType: 'listing_group.created',
        payload: { listingGroupId: created.id },
      });
      return created;
    });
  }
}
