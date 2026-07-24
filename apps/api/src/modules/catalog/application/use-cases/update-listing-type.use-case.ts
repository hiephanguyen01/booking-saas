import { Inject, Injectable } from '@nestjs/common';
import type { UpdateListingTypeInput } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import { ListingType } from '../../domain/entities/listing-type.entity';
import {
  ListingTypeNotFound,
  ListingTypeSlugTaken,
} from '../../domain/errors/listing-type-errors';
import {
  LISTING_TYPE_REPOSITORY,
  type IListingTypeRepository,
  type ListingTypeRecord,
} from '../../domain/ports/listing-type-repository.port';

/** Tenant admin edits a listing type; the aggregate enforces the merged-state rules (§7.3). */
@Injectable()
export class UpdateListingTypeUseCase {
  constructor(
    @Inject(LISTING_TYPE_REPOSITORY) private readonly repo: IListingTypeRepository,
    private readonly tenantDb: TenantDbService,
    private readonly outbox: OutboxService,
  ) {}

  async execute(
    tenantId: string,
    id: string,
    input: UpdateListingTypeInput,
  ): Promise<ListingTypeRecord> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const existing = await this.repo.findById(tx, id);
      if (!existing) throw new ListingTypeNotFound();
      if (input.slug && input.slug !== existing.slug) {
        const other = await this.repo.findBySlug(tx, input.slug);
        if (other && other.id !== id) throw new ListingTypeSlugTaken(input.slug);
      }
      const listingType = ListingType.rehydrate(existing);
      const patch = listingType.applyUpdate(input, existing.listingCount);
      const updated = await this.repo.update(tx, id, patch);
      await this.outbox.emit(tx, {
        tenantId,
        eventType: 'listing_type.updated',
        payload: { listingTypeId: id },
      });
      return updated;
    });
  }
}
