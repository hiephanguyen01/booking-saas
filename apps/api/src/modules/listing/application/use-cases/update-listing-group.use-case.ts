import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { UpdateListingGroupInput } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import {
  LISTING_GROUP_REPOSITORY,
  type IListingGroupRepository,
  type ListingGroupRecord,
} from '../../domain/ports/listing-group-repository.port';
import {
  LISTING_REPOSITORY,
  type IListingRepository,
} from '../../domain/ports/listing-repository.port';

@Injectable()
export class UpdateListingGroupUseCase {
  constructor(
    @Inject(LISTING_GROUP_REPOSITORY) private readonly repo: IListingGroupRepository,
    @Inject(LISTING_REPOSITORY) private readonly listings: IListingRepository,
    private readonly tenantDb: TenantDbService,
    private readonly outbox: OutboxService,
  ) {}

  async execute(
    tenantId: string,
    id: string,
    input: UpdateListingGroupInput,
    options: { requirePartnerId?: string } = {},
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
      if (options.requirePartnerId && existing.partnerId !== options.requirePartnerId) {
        throw new ForbiddenException({ statusCode: 403, code: 'LISTING_GROUP_NOT_OWNED', message: 'Listing group belongs to another partner' });
      }
      if (options.requirePartnerId && !['draft', 'archived'].includes(existing.status)) {
        throw new ConflictException({
          statusCode: 409,
          code: 'LISTING_GROUP_READ_ONLY',
          message: 'Hide the listing group before editing it',
        });
      }
      if (options.requirePartnerId && existing.status === 'archived') {
        const draftState = { status: 'draft' as const, publishedBy: null, hiddenBy: null };
        await this.repo.moderate(tx, id, draftState);
        const children = await this.listings.list(tx, { groupId: id, partnerId: existing.partnerId });
        await Promise.all(children.map((child) => this.listings.moderate(tx, child.id, draftState)));
        await this.outbox.emit(tx, {
          tenantId,
          eventType: 'listing_group.reopened',
          payload: { listingGroupId: id },
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
        partnerId: options.requirePartnerId ? undefined : input.partnerId,
        listingTypeId: options.requirePartnerId ? undefined : input.listingTypeId,
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
