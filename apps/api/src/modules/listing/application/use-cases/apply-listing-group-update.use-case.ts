import { Inject, Injectable } from '@nestjs/common';
import type { UpdateListingGroupInput } from '@booking/contracts';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import {
  LISTING_GROUP_REPOSITORY,
  type IListingGroupRepository,
  type ListingGroupRecord,
} from '../../domain/ports/listing-group-repository.port';
import { ResolveAdministrativeAddressUseCase } from '../../../administrative-division/application/use-cases/resolve-administrative-address.use-case';
import { ListingGroup } from '../../domain/entities/listing-group.entity';
import {
  ListingGroupNotFound,
  ListingGroupSlugTaken,
} from '../../domain/errors/listing-group-errors';
import {
  InvalidListingAdministrativeDivision,
  ListingStateChanged,
} from '../../domain/errors/listing-errors';

/**
 * The post's content write, inside a caller-owned transaction — the group mirror
 * of {@link ApplyListingUpdateUseCase}, shared by the direct update and by a
 * reviewer approving a parked edit.
 *
 * Unlike the pre-revision flow, this no longer drags a published post back to
 * `draft` before letting the partner edit: a partner's edit of a reviewed post is
 * parked as a revision, so by the time this runs the change has either been
 * approved or belongs to a post that was never published.
 */
@Injectable()
export class ApplyListingGroupUpdateUseCase {
  constructor(
    @Inject(LISTING_GROUP_REPOSITORY) private readonly repo: IListingGroupRepository,
    private readonly resolveAdministrativeAddress: ResolveAdministrativeAddressUseCase,
    private readonly outbox: OutboxService,
  ) {}

  async execute(
    tx: PrismaTx,
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

    const existing = await this.repo.findById(tx, id);
    if (!existing) {
      throw new ListingGroupNotFound();
    }
    const group = ListingGroup.rehydrate(existing);
    group.assertOwnedForManage(options.requirePartnerId);
    if (input.slug && input.slug !== existing.slug) {
      const other = await this.repo.findBySlug(tx, input.slug);
      if (other && other.id !== id) {
        throw new ListingGroupSlugTaken(input.slug);
      }
    }
    const updated = await this.repo.update(
      tx,
      id,
      existing.updatedAt,
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
        latitude: input.latitude,
        longitude: input.longitude,
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
  }
}
