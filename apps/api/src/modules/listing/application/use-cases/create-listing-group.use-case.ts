import { Inject, Injectable } from '@nestjs/common';
import type { CreateListingGroupInput } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import { ListingTypeNotFound } from '../../../../shared/domain/errors/listing-type-not-found';
import {
  LISTING_GROUP_REPOSITORY,
  type IListingGroupRepository,
  type ListingGroupRecord,
} from '../../domain/ports/listing-group-repository.port';
import {
  LISTING_TYPE_REPOSITORY,
  type IListingTypeRepository,
} from '../../../catalog/domain/ports/listing-type-repository.port';
import { ResolveAdministrativeAddressUseCase } from '../../../administrative-division/application/use-cases/resolve-administrative-address.use-case';
import { ListingGroup } from '../../domain/entities/listing-group.entity';
import { ListingGroupSlugTaken } from '../../domain/errors/listing-group-errors';

/** Two-tier post: a group (album/amenities/address) that holds room/package listings (§7.3). */
@Injectable()
export class CreateListingGroupUseCase {
  constructor(
    @Inject(LISTING_GROUP_REPOSITORY) private readonly repo: IListingGroupRepository,
    @Inject(LISTING_TYPE_REPOSITORY) private readonly listingTypes: IListingTypeRepository,
    private readonly resolveAdministrativeAddress: ResolveAdministrativeAddressUseCase,
    private readonly tenantDb: TenantDbService,
    private readonly outbox: OutboxService,
  ) {}

  async execute(tenantId: string, input: CreateListingGroupInput): Promise<ListingGroupRecord> {
    const location = await this.resolveAdministrativeAddress.execute(
      input.provinceCode,
      input.wardCode,
    );
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const listingType = await this.listingTypes.findById(tx, input.listingTypeId);
      if (!listingType) throw new ListingTypeNotFound();
      ListingGroup.assertGroupableType(listingType.structure);
      if (await this.repo.findBySlug(tx, input.slug)) {
        throw new ListingGroupSlugTaken(input.slug);
      }
      const created = await this.repo.create(
        tx,
        tenantId,
        ListingGroup.open({
          partnerId: input.partnerId,
          listingTypeId: input.listingTypeId,
          title: input.title,
          slug: input.slug,
          description: input.description ?? null,
          provinceCode: location.province.code,
          provinceName: location.province.name,
          wardCode: location.ward.code,
          wardName: location.ward.name,
          address: input.address,
          workingArea: input.workingArea ?? null,
          amenities: input.amenities,
          photos: input.photos,
        }),
      );
      await this.outbox.emit(tx, {
        tenantId,
        eventType: 'listing_group.created',
        payload: { listingGroupId: created.id },
      });
      return created;
    });
  }
}
