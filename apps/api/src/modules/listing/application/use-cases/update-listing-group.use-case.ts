import { Inject, Injectable } from '@nestjs/common';
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
import { ResolveAdministrativeAddressUseCase } from '../../../administrative-division/application/use-cases/resolve-administrative-address.use-case';
import { ListingGroup } from '../../domain/entities/listing-group.entity';
import {
  ListingGroupNotFound,
  ListingGroupSlugTaken,
} from '../../domain/errors/listing-group-errors';
import { ListingStateChanged } from '../../domain/errors/listing-errors';
import { InvalidListingAdministrativeDivision } from '../../domain/errors/listing-errors';

@Injectable()
export class UpdateListingGroupUseCase {
  constructor(
    @Inject(LISTING_GROUP_REPOSITORY) private readonly repo: IListingGroupRepository,
    @Inject(LISTING_REPOSITORY) private readonly listings: IListingRepository,
    private readonly resolveAdministrativeAddress: ResolveAdministrativeAddressUseCase,
    private readonly tenantDb: TenantDbService,
    private readonly outbox: OutboxService,
  ) {}

  async execute(
    tenantId: string,
    id: string,
    input: UpdateListingGroupInput,
    options: { requirePartnerId?: string } = {},
  ): Promise<ListingGroupRecord> {
    const hasLocationCodes = input.provinceCode !== undefined || input.wardCode !== undefined;
    if (hasLocationCodes && (!input.provinceCode || !input.wardCode)) {
      throw new InvalidListingAdministrativeDivision();
    }
    const location =
      input.provinceCode && input.wardCode
        ? await this.resolveAdministrativeAddress.execute(input.provinceCode, input.wardCode)
        : null;
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const existing = await this.repo.findById(tx, id);
      if (!existing) {
        throw new ListingGroupNotFound();
      }
      const group = ListingGroup.rehydrate(existing);
      let expectedUpdatedAt = existing.updatedAt;
      group.assertOwnedForManage(options.requirePartnerId);
      if (options.requirePartnerId) {
        group.assertEditableStatus();
      }
      if (options.requirePartnerId && existing.status === 'archived') {
        const draftState = { status: 'draft' as const, publishedBy: null, hiddenBy: null };
        const reopened = await this.repo.moderate(tx, id, existing.status, draftState);
        if (!reopened) throw new ListingStateChanged();
        expectedUpdatedAt = reopened.updatedAt;
        const children = await this.listings.list(tx, {
          groupId: id,
          partnerId: existing.partnerId,
        });
        const reopenedChildren = await Promise.all(
          children.map((child) => this.listings.moderate(tx, child.id, child.status, draftState)),
        );
        if (reopenedChildren.some((child) => child === null)) throw new ListingStateChanged();
        await this.outbox.emit(tx, {
          tenantId,
          eventType: 'listing_group.reopened',
          payload: { listingGroupId: id },
        });
      }
      if (input.slug && input.slug !== existing.slug) {
        const other = await this.repo.findBySlug(tx, input.slug);
        if (other && other.id !== id) {
          throw new ListingGroupSlugTaken(input.slug);
        }
      }
      const updated = await this.repo.update(
        tx,
        id,
        expectedUpdatedAt,
        group.applyContentUpdate({
          partnerId: options.requirePartnerId ? undefined : input.partnerId,
          listingTypeId: options.requirePartnerId ? undefined : input.listingTypeId,
          title: input.title,
          slug: input.slug,
          description: input.description,
          provinceCode: location?.province.code,
          provinceName: location?.province.name,
          wardCode: location?.ward.code,
          wardName: location?.ward.name,
          address: input.address,
          workingArea: input.workingArea,
          amenities: input.amenities,
          photos: input.photos,
        }),
      );
      if (!updated) throw new ListingStateChanged();
      await this.outbox.emit(tx, {
        tenantId,
        eventType: 'listing_group.updated',
        payload: { listingGroupId: id },
      });
      return updated;
    });
  }
}
