import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import { ListingType } from '../../domain/entities/listing-type.entity';
import { ListingTypeNotFound } from '../../../../shared/domain/errors/listing-type-not-found';
import {
  LISTING_TYPE_REPOSITORY,
  type IListingTypeRepository,
} from '../../domain/ports/listing-type-repository.port';

/** Delete a listing type; blocked while any listing still references it (§7.3). */
@Injectable()
export class DeleteListingTypeUseCase {
  constructor(
    @Inject(LISTING_TYPE_REPOSITORY) private readonly repo: IListingTypeRepository,
    private readonly tenantDb: TenantDbService,
    private readonly outbox: OutboxService,
  ) {}

  async execute(tenantId: string, id: string): Promise<void> {
    await this.tenantDb.forTenant(tenantId, async (tx) => {
      const existing = await this.repo.findById(tx, id);
      if (!existing) throw new ListingTypeNotFound();
      const inUse = await this.repo.countListingsOfType(tx, id);
      ListingType.rehydrate(existing).assertDeletable(inUse);
      await this.repo.delete(tx, id);
      await this.outbox.emit(tx, {
        tenantId,
        eventType: 'listing_type.deleted',
        payload: { listingTypeId: id },
      });
    });
  }
}
